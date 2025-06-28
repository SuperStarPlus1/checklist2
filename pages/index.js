import { useState, useEffect } from "react";

export default function Home() {
  const itemsData = [
    { text: "לוודא שכל הקרטונים בדחסן", requireImage: true },
    { text: "להוציא עגלות מהמחסן", requireImage: false },
    { text: "לוודא עם עובד מחלקת ירקות חיבור מלגזה לטעינה", requireImage: true },
    // ... המשך הרשימה כפי שהיתה
  ];

  const [folderName, setFolderName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [items, setItems] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [progressStage, setProgressStage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [reportLink, setReportLink] = useState("");
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    const now = new Date();
   setFolderName(`super/${now.toISOString().split("T")[0]}`);

    setItems(
      itemsData.map((item) => ({
        ...item,
        done: false,
        images: [],
      }))
    );
  }, []);

  // עידכון מצב סיום משימה
  function toggleDone(index) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
    );
  }

  // הוספת תמונה
  async function addImage(index) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if ((uploadedFiles[index]?.length || 0) >= 9) {
        alert("ניתן להעלות עד 9 תמונות לכל סעיף בלבד.");
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(",")[1];
        const fileName = `item${index}_image${(uploadedFiles[index]?.length || 0) + 1}.jpg`;

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderName, fileName, fileData: base64 }),
          });

          if (res.ok) {
            setUploadedFiles((prev) => ({
              ...prev,
              [index]: [...(prev[index] || []), fileName],
            }));

            setItems((prev) =>
              prev.map((item, i) =>
                i === index ? { ...item, done: true, images: [...(item.images || []), fileName] } : item
              )
            );
          } else {
            alert("שגיאה בהעלאת התמונה");
          }
        } catch (err) {
          alert("שגיאה בהעלאת התמונה: " + err.message);
        }
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  // חישוב משימות שנותרו
  const tasksLeft = items.filter((item) => !item.done).length;

  // יצירת הדוח
  async function createReport(e) {
    e.preventDefault();

    // אפשר להוסיף בדיקת שדות חובה כאן אם תרצה

    setShowProgress(true);
    setProgressStage("יוצר דוח...");
    setProgressPercent(80);

    const payload = {
      folderName,
      employeeName,
      sections: items.map(({ text, done, images, requireImage }) => ({
        text,
        done,
        images: uploadedFiles[items.indexOf({ text })] || [],
        requireImage,
      })),
    };

    const res = await fetch("/api/create-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      setProgressStage("הושלם!");
      setProgressPercent(100);
      setReportLink(data.link);
    } else {
      alert("שגיאה ביצירת הדוח.");
      setShowProgress(false);
    }
  }

  // שליחת דוח בוואטסאפ
  function sendWhatsApp() {
    if (!reportLink) return;
    window.open(
      `https://api.whatsapp.com/send?phone=972549090028&text=${encodeURIComponent(
        "נוצר דוח חדש:\n" + reportLink
      )}`,
      "_blank"
    );
    alert("תודה ששלחת את הטופס!");
    setShowProgress(false);
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          backgroundColor: "#2196f3",
          color: "white",
          padding: "10px 20px",
          borderRadius: "50px",
          fontSize: 16,
          zIndex: 1000,
        }}
      >
        משימות שנותרו: {tasksLeft}
      </div>

      <form onSubmit={createReport} style={{ padding: 20, direction: "rtl" }}>
        <div style={{ marginBottom: 15 }}>
          <label>
            שם עובד:
            <input
              required
              type="text"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              style={{ marginRight: 10 }}
            />
          </label>
        </div>

        {items.map((item, idx) => (
          <div
            key={idx}
            style={{
              background: "white",
              marginBottom: 15,
              padding: 15,
              borderRadius: 12,
              boxShadow: "0 0 10px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label style={{ flex: 1, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleDone(idx)}
                style={{ marginLeft: 10 }}
              />
              {item.text}
            </label>
            {item.requireImage && (
              <>
                <button
                  type="button"
                  onClick={() => addImage(idx)}
                  style={{
                    background: "#2196f3",
                    border: "none",
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    cursor: "pointer",
                    marginRight: 10,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    transition: "transform 0.2s",
                    animation: "pulse 2s infinite",
                  }}
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/685/685655.png"
                    alt="Add"
                    style={{ width: 24, height: 24, filter: "invert(100%)" }}
                  />
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  {(uploadedFiles[idx] || []).map((file, i) => (
                    <img
                      key={i}
                      src={`https://content.dropboxapi.com/2/files/download?path=/forms/super/${folderName}/${file}`}
                      alt={`image ${i + 1}`}
                      style={{
                        width: 50,
                        height: 50,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #ccc",
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        <button
          type="submit"
          style={{
            marginTop: 20,
            padding: "10px 30px",
            fontSize: 18,
            backgroundColor: "#2196f3",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          שלח טופס בקרה
        </button>
      </form>

      {showProgress && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 15,
              padding: 30,
              textAlign: "center",
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
            }}
          >
            <h2>{progressStage}</h2>
            <div
              style={{
                width: "100%",
                height: 20,
                backgroundColor: "#ddd",
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #ffeb3b, #ffc107)",
                  transition: "width 0.5s ease-in-out",
                }}
              />
            </div>
            {reportLink && (
              <>
                <button
                  onClick={() => {
                    window.open(
                      `https://api.whatsapp.com/send?phone=972549090028&text=${encodeURIComponent(
                        "נוצר דוח חדש:\n" + reportLink
                      )}`,
                      "_blank"
                    );
                    alert("תודה ששלחת את הטופס!");
                    setShowProgress(false);
                  }}
                  style={{
                    backgroundColor: "#25d366",
                    color: "white",
                    border: "none",
                    padding: "15px 30px",
                    borderRadius: 50,
                    fontSize: 20,
                    cursor: "pointer",
                    marginTop: 20,
                  }}
                >
                  📤 שלח את הדוח בוואטסאפ
                </button>
                <button
                  onClick={() => setShowProgress(false)}
                  style={{
                    marginLeft: 10,
                    fontSize: 20,
                    cursor: "pointer",
                    marginTop: 20,
                  }}
                >
                  ❌ סגור
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 5px yellow;
          }
          50% {
            box-shadow: 0 0 15px yellow;
          }
          100% {
            box-shadow: 0 0 5px yellow;
          }
        }
      `}</style>
    </>
  );
}
