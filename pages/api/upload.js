import { getDropboxAccessToken } from '../../utils/dropbox';

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { folderName, fileName, fileData } = req.body;
  if (!folderName) return res.status(400).json({ error: 'Missing folderName' });
  if (!fileName) return res.status(400).json({ error: 'Missing fileName' });
  if (!fileData) return res.status(400).json({ error: 'Missing fileData' });

  const DROPBOX_PATH = `/forms/${folderName}/${fileName}`;

  try {
    const DROPBOX_TOKEN = await getDropboxAccessToken();

    const buffer = Buffer.from(fileData, 'base64');

    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: DROPBOX_PATH,
          mode: 'overwrite',
          autorename: false,
          mute: false,
        }),
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error('Upload failed:', errorText);
      return res.status(500).json({ error: 'Upload failed' });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
}
