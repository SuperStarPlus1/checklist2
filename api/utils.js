export async function downloadFileAsBase64(token, path) {
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
