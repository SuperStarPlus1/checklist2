export const config = { runtime: "nodejs" };

async function getDropboxAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.DROPBOX_REFRESH_TOKEN);

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`
      ).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('Failed to refresh token:', error);
    throw new Error('Cannot refresh Dropbox token');
  }

  const data = await res.json();
  return data.access_token;
}

async function downloadFileAsBase64(token, path) {
  try {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });
    if (!res.ok) throw new Error('File not found');

    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch {
    throw new Error('File not found');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, employeeName, sections } = req.body;
    if (!folderName || !employeeName || !sections) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const DROPBOX_TOKEN = await getDropboxAccessToken();

    const logoPath = `/forms/logo.png`; // הלוגו נמצא בתיקיה forms בשורש דרופבוקס

    // הורדת הלוגו פעם אחת כ-base64
    let base64Logo = null;
    try {
      base64Logo = await downloadFileAsBase64(DROPBOX_TOKEN, logoPath);
    } catch {
      console.warn('Logo image not found in Dropbox, skipping logo display');
      base64Logo = null;
    }

    const reportLines = [];

    reportLines.push(`<table>`);
    reportLines.push(`<thead><tr><th style="text-align:right">משימה</th><th>סטטוס</th><th>תמונות</th></tr></thead>`);
    reportLines.push(`<tbody>`);

    for (const section of sections) {
      const status = section.done ? '✅' : '❌';

      let imagesHtml = '';
      if (section.requireImage) {
        if (section.images && section.images.length > 0) {
          const imgsHtml = [];
          for (let i = 0; i < Math.min(3, section.images.length); i++) {
            const imagePath = `/forms/super/${folderName}/${section.images[i]}`;
            let base64Image;
            try {
              base64Image = await downloadFileAsBase64(DROPBOX_TOKEN, imagePath);
            } catch {
              base64Image = null;
            }
            if (base64Image) {
              imgsHtml.push(`<img src="data:image/jpeg;base64,${base64Image}" style="width:120px; height:120px; object-fit:cover; margin:5px; border:1px solid #ccc; border-radius:8px;" />`);
            }
          }
          if (imgsHtml.length > 0) {
            imagesHtml = `<div style="display:flex; gap:10px;">${imgsHtml.join('')}</div>`;
          } else if (base64Logo) {
            // הצגת לוגו חלופי אם אין תמונות
            imagesHtml = `<img src="data:image/png;base64,${base64Logo}" alt="No image" style="width:120px; height:120px; object-fit:contain; margin:5px; border:1px solid #666; border-radius:8px;" />`;
          }
        } else if (base64Logo) {
          // סעיף עם דרישת תמונה אבל אין תמונות בכלל - מציג לוגו
          imagesHtml = `<img src="data:image/png;base64,${base64Logo}" alt="No image" style="width:120px; height:120px; object-fit:contain; margin:5px; border:1px solid #666; border-radius:8px;" />`;
        }
      } else {
        // סעיף ללא דרישת תמונה - אין תמונות להצגה
        imagesHtml = '';
      }

      reportLines.push(`
        <tr>
          <td style="text-align: right; direction: rtl;">${section.text}</td>
          <td style="text-align: center;">${status}</td>
          <td style="text-align: center;">${imagesHtml}</td>
        </tr>
      `);
    }

    reportLines.push(`</tbody>`);
    reportLines.push(`</table>`);

    const html = `
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>דוח סגירת סניף</title>
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; padding: 20px; }
          h2, h3 { text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          td, th { border: 1px solid #666; padding: 8px; text-align: right; }
          img { border-radius: 8px; border: 1px solid #ccc; width: 120px; height: 120px; object-fit: cover; }
          div.images-row { display: flex; gap: 10px; }
        </style>
      </head>
      <body>
        <h2>דוח סגירת סניף</h2>
        <p><strong>עובד:</strong> ${employeeName}</p>
        <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
        ${reportLines.join("\n")}
      </body>
      </html>
    `;

    // שמירת הדוח בתיקיית הפרויקט בדרופבוקס
    const filename = `report_${folderName}.html`;
    const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/forms/super/${folderName}/${filename}`,
          mode: "overwrite",
          autorename: false,
          mute: false,
        }),
      },
      body: Buffer.from(html),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload report error:", errorText);
      return res.status(500).json({ error: "Failed to upload report" });
    }

    // יצירת קישור שיתוף
    const shareResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: `/forms/super/${folderName}/${filename}`,
        settings: { requested_visibility: "public" },
      }),
    });

    const shareResult = await shareResponse.json();
    if (!shareResponse.ok) {
      console.error("Share link error:", shareResult);
      return res.status(500).json({ error: "Failed to create share link" });
    }

    const link = shareResult.url.replace("?dl=0", "?raw=1");
    res.status(200).json({ link });
  } catch (err) {
    console.error("Report Error:", err);
    res.status(500).json({ error: err.message });
  }
}
