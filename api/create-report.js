import { getDropboxAccessToken } from './share-report';
import { downloadFileAsBase64 } from './utils';

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
          let base64Image;
          try {
            base64Image = await downloadFileAsBase64(DROPBOX_TOKEN, imagePath);
          } catch {
            base64Image = await downloadFileAsBase64(DROPBOX_TOKEN, "/forms/logo.png");
          }
          reportLines.push(`<img src="data:image/jpeg;base64,${base64Image}" class="photo" />`);
        }
      } else if (section.text.includes('תמונה')) {
        const fallback = await downloadFileAsBase64(DROPBOX_TOKEN, "/forms/logo.png");
        reportLines.push(`<img src="data:image/jpeg;base64,${fallback}" class="photo" />`);
      }
    }

    const html = `
      <html><head><meta charset="UTF-8">
      <style>.photo{width:100%;max-width:400px;margin:10px auto;display:block}</style>
      </head><body>
      <h2>דוח סגירת סניף</h2>
      <p><strong>עובד:</strong> ${employeeName}</p>
      <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
      ${reportLines.join("\n")}
      </body></html>
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
    const url = shareData?.url?.replace("?dl=0", "?raw=1");
    res.status(200).json({ link: url });

  } catch (err) {
    console.error("Report Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
