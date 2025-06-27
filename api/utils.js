export async function downloadFileAsBase64(token, path) {
  const downloadRes = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path })
    }
  });

  if (!downloadRes.ok) {
    const errText = await downloadRes.text();
    console.error("Download error:", errText);
    throw new Error("Download failed");
  }

  const buffer = await downloadRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
