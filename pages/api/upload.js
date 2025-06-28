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

// פונקציה רקורסיבית לשינוי שם תיקיה קיימת
async function renameExistingFolder(oldPath, version = 1) {
  const newPath = `${oldPath}_ver${version}`;

  const DROPBOX_TOKEN = await getDropboxAccessToken();
  const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DROPBOX_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path: newPath })
  });

  if (checkResp.ok) {
    return renameExistingFolder(oldPath, version + 1);
  } else if (checkResp.status === 409) {
    const moveResp = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from_path: oldPath,
        to_path: newPath,
        autorename: false
      })
    });

    if (!moveResp.ok) {
      const errText = await moveResp.text();
      throw new Error("Failed to rename existing folder: " + errText);
    }

    return newPath;
  } else {
    const errText = await checkResp.text();
    throw new Error("Error checking folder existence: " + errText);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { folderName, fileName, fileData } = req.body;

    if (!folderName) {
      return res.status(400).json({ error: 'Missing folderName' });
    }

    // שים לב לשינוי פה - הנתיב החדש
    const basePath = `/forms/super/${folderName}`;
    const DROPBOX_TOKEN = await getDropboxAccessToken();

    if (!fileName && !fileData) {
      const checkResp = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: basePath })
      });

      let finalPath = basePath;

      if (checkResp.ok) {
        finalPath = await renameExistingFolder(basePath);
      } else if (checkResp.status !== 409) {
        const errText = await checkResp.text();
        throw new Error("Error checking folder existence: " + errText);
      }

      const createResp = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DROPBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: finalPath, autorename: false })
      });

      if (!createResp.ok) {
        const err = await createResp.text();
        throw new Error("Failed to create folder: " + err);
      }

      return res.status(200).json({ folderPath: finalPath });
    }

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing fileName or fileData' });
    }

    const fileBuffer = Buffer.from(fileData, 'base64');

    const uploadResp = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `${basePath}/${fileName}`,
          mode: "overwrite",
          autorename: false,
          mute: false
        })
      },
      body: fileBuffer
    });

    if (!uploadResp.ok) {
      const error = await uploadResp.text();
      console.error("Dropbox upload error:", error);
      return res.status(500).json({ error: error });
    }

    return res.status(200).json({ message: "File uploaded" });

  } catch (err) {
    console.error("Upload API Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
