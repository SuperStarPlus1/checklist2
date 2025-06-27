export const config = { runtime: "nodejs" };

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, fileName, fileData } = req.body;

    if (!folderName) {
      return res.status(400).json({ error: 'Missing folderName in request' });
    }
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing fileName or fileData in request' });
    }

    // פשוט מעלים את הקובץ לתיקיה שקיבלנו
    const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `${folderName}/${fileName}`,
          mode: "overwrite",
          autorename: true,
          mute: false
        })
      },
      body: Buffer.from(fileData, "base64")
    });

    if (!uploadResp.ok) {
      const errorText = await uploadResp.text();
      return res.status(500).json({ error: 'Upload failed', details: errorText });
    }

    res.status(200).json({ success: true, folderName, fileName });

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
}
