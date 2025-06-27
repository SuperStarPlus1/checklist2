export const config = { runtime: "nodejs" };

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, fileName, fileData } = req.body;
    const basePath = `/forms/${folderName}`;
    let finalPath = basePath;
    let version = 1;

    // Check if folder exists and generate unique path
    while (true) {
      const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: finalPath })
      });

      if (checkResp.status === 409) break; // folder does not exist
      if (!checkResp.ok) throw new Error("שגיאה בבדיקת שם תיקיה");
      finalPath = `${basePath}_ver${version}`;
      version++;
    }

    // Create folder
    await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: finalPath, autorename: false })
    });

    // Upload the file
    const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `${finalPath}/${fileName}`,
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

    res.status(200).json({ success: true, folderPath: finalPath });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
