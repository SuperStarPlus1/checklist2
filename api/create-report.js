import { getDropboxAccessToken } from './share-report.js';

export const config = { runtime: "nodejs" };

// פונקציה לקבלת קישור שיתוף ישיר ל-dropbox path
async function getSharedLink(token, path) {
  // מנסה ליצור קישור שיתוף
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path, settings: { requested_visibility: "public" } })
  });

  if (!res.ok) {
    // אם הקישור כבר קיים או שגיאה, מנסה לקבל קישורים קיימים
    const listRes = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path })
    });
    if (!listRes.ok) return null;
    const data = await listRes.json();
    if (data.links && data.links.length > 0) {
      return data.links[0].url.replace("?dl=0", "?raw=1");
    }
    return null;
  }

  const data = await res.json();
  return data.url.replace("?dl=0", "?raw=1");
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, employeeName, sections } = req.body;
    const DROPBOX_TOKEN = await getDropboxAccessToken();

    const reportLines = [];

    for (const section of sections) {
      const status = section.done ? '✅' : '❌';
      reportLines.push(`<h3>${status} ${section.text}</h3>`);

      if (section.images && section.images.length > 0) {
        for (const file of section.images) {
          const imagePath = `/forms/${folderName}/${file}`;
          const fallbackLink = await getSharedLink(DROPBOX_TOKEN, "/forms/logo.png");
          let realLink = await getSharedLink(DROPBOX_TOKEN, imagePath);
          if (!realLink) realLink = fallbackLink;

          reportLines.push(`
            <img 
              src="${fallbackLink}" 
              data-real-src="${realLink}" 
              class="photo" 
              onerror="this.onerror=null;this.src='${fallbackLink}';"
            />
          `);
        }
      } else if (section.text.includes('תמונה')) {
        // מציגים תמונה חליפית אם אין תמונות בכלל בסעיף שדורש תמונה
        const fallbackLink = await getSharedLink(DROPBOX_TOKEN, "/forms/logo.png");
        reportLines.push(`<img src="${fallbackLink}" class="photo" />`);
      }
    }

    const html = `
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; padding: 10px; }
          .photo { width: 100%; max-width: 400px; margin: 10px auto; display: block; border-radius: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.3); }
          h2 { text-align: center; }
          h3 { margin-top: 25px; }
        </style>
      </head>
      <body>
        <h2>דוח סגירת סניף</h2>
        <p><strong>עובד:</strong> ${employeeName}</p>
        <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
        ${reportLines.join("\n")}
        
        <script>
          // סקריפט להחלפת תמונות חלופיות לתמונות אמיתיות אם הן זמינות
          document.querySelectorAll('img[data-real-src]').forEach(img => {
            const realSrc = img.getAttribute('data-real-src');
            const testImg = new Image();
            testImg.onload = () => { img.src = realSrc; };
            testImg.onerror = () => { /* נשאר עם החליפית */ };
            testImg.src = realSrc;
          });
        </script>
      </body>
      </html>
    `;

    const filename = `report_${folderName}.html`;
    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/forms/${folderName}/${filename}`,
          mode: "overwrite",
          autorename: true,
          mute: false
        })
      },
      body: Buffer.from(html)
    });

    if (!upload.ok) {
      const errText = await upload.text();
      return res.status(500).json({ error: 'Failed to upload report', details: errText });
    }

    const shareLink = await getSharedLink(DROPBOX_TOKEN, `/forms/${folderName}/${filename}`);
    res.status(200).json({ link: shareLink });

  } catch (err) {
    console.error("Report Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
