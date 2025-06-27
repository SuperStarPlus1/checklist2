import { getDropboxAccessToken } from './share-report';

export const config = { runtime: "nodejs" };

let finalPathCache = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const DROPBOX_TOKEN = await getDropboxAccessToken();
    const { folderName, fileName, fileData } = req.body;

    if (!finalPathCache) {
      const basePath = `/forms/${folderName}`;
      let finalPath = basePath;
      let version = 1;

      while (true) {
        const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DROPBOX_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ path: finalPath })
        });

        if (checkResp.status === 409) break;
        if (!checkResp.ok) {
          const errorText = await checkResp.text();
          console.error("get_metadata error:", errorText);
          throw new Error("שגיאה בבדיקת שם תיקיה");
        }

        finalPath = `${basePath}_ver${version}`;
        version++;
      }

      await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: finalPath, autorename: false })
      });

      finalPathCache = finalPath;
    }

    const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `${finalPathCache}/${fileName}`,
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

    res.status(200).json({ success: true, folderPath: finalPathCache });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
}
