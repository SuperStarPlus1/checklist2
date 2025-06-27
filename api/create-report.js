import { getDropboxAccessToken } from './share-report';

export const config = { runtime: "nodejs" };

async function downloadFileAsBase64(token, path) {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return base64;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, employeeName, sections } = req.body;
    const DROPBOX_TOKEN = await getDropboxAccessToken();

    // הורדת תמונת לוגו פעם אחת לשימוש כחליפית
    let fallbackBase64 = "";
    try {
      fallbackBase64 = await downloadFileAsBase64(DROPBOX_TOKEN, "/forms/logo.png");
    } catch {
      fallbackBase64 = ""; // אם לא מצליחים להוריד - נשאר ריק
    }

    // הכנת HTML של כל הסעיפים עם תמונות base64
    const reportLines = [];

    for (const section of sections) {
      // הורדת כל התמונות בסעיף ל-base64
      const imagesBase64 = [];
      for (const file of section.images || []) {
        try {
          const base64 = await downloadFileAsBase64(DROPBOX_TOKEN, `/forms/${folderName}/${file}`);
          imagesBase64.push(base64);
        } catch {
          // במידה וההורדה נכשלה, מדלגים על התמונה
        }
      }

      const status = section.done ? '✅' : '❌';

      reportLines.push(`
        <h3>${status} ${section.text}</h3>
        <div class="images-container">
          ${
            imagesBase64.length > 0
            ? imagesBase64.map(b64 => `<img src="data:image/jpeg;base64,${b64}" alt="תמונה">`).join('')
            : `<img src="data:image/jpeg;base64,${fallbackBase64}" alt="תמונה חליפית" />`
          }
        </div>
      `);
    }

    const html = `
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            direction: rtl;
            text-align: right;
            margin: 20px;
          }
          h2 {
            text-align: center;
            margin-bottom: 30px;
          }
          h3 {
            border-bottom: 2px solid #2196f3;
            padding-bottom: 5px;
            margin-top: 30px;
            margin-bottom: 15px;
          }
          .images-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-start;
          }
          .images-container img {
            width: calc((100% - 20px) / 3);
            max-width: 200px;
            height: 150px;
            object-fit: cover;
            border: 1px solid #999;
            border-radius: 8px;
            box-shadow: 0 0 5px rgba(0,0,0,0.2);
          }
        </style>
      </head>
      <body>
        <h2>דוח סגירת סניף</h2>
        <p><strong>עובד:</strong> ${employeeName}</p>
        <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
        ${reportLines.join('\n')}
      </body>
      </html>
    `;

    const filename = `report_${folderName}.html`;
    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/forms/${folderName}/${filename}`,
          mode: "overwrite",
          autorename: true,
          mute: false,
        }),
      },
      body: Buffer.from(html),
    });

    if (!upload.ok) {
      const errText = await upload.text();
      return res.status(500).json({ error: 'Failed to upload report', details: errText });
    }

    const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: `/forms/${folderName}/${filename}` }),
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
