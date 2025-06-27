import { getDropboxAccessToken } from './share-report';
import { downloadFileAsBase64 } from './utils';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, employeeName, sections } = req.body;
    const DROPBOX_TOKEN = await getDropboxAccessToken();
    const reportLines = [];

    // הורדת תמונת לוגו פעם אחת לשימוש כחליפית
    let fallbackBase64 = "";
    try {
      fallbackBase64 = await downloadFileAsBase64(DROPBOX_TOKEN, "/forms/logo.png");
    } catch {
      fallbackBase64 = ""; // במצב חמור, להשאיר ריק
    }

    for (const section of sections) {
      const status = section.done ? '✅' : '❌';
      reportLines.push(`<h3>${status} ${section.text}</h3>`);

      if (section.images && section.images.length > 0) {
        for (const file of section.images) {
          const imagePath = `/forms/${folderName}/${file}`;
          let actualBase64 = null;

          try {
            actualBase64 = await downloadFileAsBase64(DROPBOX_TOKEN, imagePath);
          } catch {
            actualBase64 = null;
          }

          if (actualBase64) {
            // הצגת תמונה עם תמונה חליפית + נתיב לתמונה אמיתית לטעינה אסינכרונית
            reportLines.push(`
              <img 
                src="data:image/jpeg;base64,${fallbackBase64}" 
                data-real-src="data:image/jpeg;base64,${actualBase64}" 
                class="photo placeholder" 
                alt="תמונה">
            `);
          } else {
            // הצג רק את התמונה החליפית
            reportLines.push(`<img src="data:image/jpeg;base64,${fallbackBase64}" class="photo" alt="תמונה חליפית" />`);
          }
        }
      } else {
        // אם אין תמונות בסעיף כלל, מציג תמונה חליפית בלבד
        reportLines.push(`<img src="data:image/jpeg;base64,${fallbackBase64}" class="photo" alt="תמונה חליפית" />`);
      }
    }

    const html = `
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          .photo {
            width: 100%;
            max-width: 400px;
            margin: 10px auto;
            display: block;
          }
        </style>
      </head>
      <body>
        <h2>דוח סגירת סניף</h2>
        <p><strong>עובד:</strong> ${employeeName}</p>
        <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
        ${reportLines.join("\n")}
        <script>
          window.addEventListener('load', () => {
            document.querySelectorAll('img.placeholder').forEach(img => {
              const realSrc = img.getAttribute('data-real-src');
              if (realSrc) {
                const testImg = new Image();
                testImg.onload = () => {
                  img.src = realSrc;
                  img.classList.remove('placeholder');
                };
                testImg.onerror = () => {
                  // אפשר להוסיף טיפול במקרה שהתמונה לא נטענה, כרגע משאירים את החליפית
                };
                testImg.src = realSrc;
              }
            });
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

    const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: `/forms/${folderName}/${filename}` })
    });

    const shareData = await shareRes.json();
    if (!shareRes.ok) {
      return res.status(500).json({ error: 'Failed to create share link', details: shareData });
    }

    const url = shareData.url.replace("?dl=0", "?raw=1");
    res.status(200).json({ link: url });

  } catch (err) {
    console.error("Report Error:", err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
}
