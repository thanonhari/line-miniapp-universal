const liffId = "2008386498-JrAadEz1"; // 👈 ใช้ LIFF ID จริงของคุณ

function mobileCheck() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function showProfile() {
  const profile = await liff.getProfile();
  const decoded = liff.getDecodedIDToken();

  document.getElementById("pictureUrl").src = profile.pictureUrl;
  document.getElementById("userId").textContent = profile.userId;
  document.getElementById("displayName").textContent = profile.displayName;
  document.getElementById("statusMessage").textContent = profile.statusMessage || "-";
  document.getElementById("email").textContent = decoded?.email || "-";

  document.getElementById("profileSection").style.display = "block";
}

async function main() {
  const status = document.getElementById("status");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  try {
    // ✅ 5.1 — เปิดใน LINE App
    if (liff.isInClient()) {
      status.textContent = "เปิดใน LINE App";
      await liff.init({ liffId });
      await showProfile();
      return;
    }

    // ✅ 5.2 — เปิดใน browser มือถือ
    if (mobileCheck()) {
      status.textContent = "กำลังเปิด LINE MINI App...";
      setTimeout(() => window.close(), 5000);
      window.location.href = `line://app/${liffId}`;
      return;
    }

    // ✅ 5.3 — เปิดใน browser บนคอมพิวเตอร์
    status.textContent = "เปิดใน browser บนคอมพิวเตอร์";
    await liff.init({ liffId, withLoginOnExternalBrowser: true });

    if (!liff.isLoggedIn()) {
      btnLogin.style.display = "inline-block";
      btnLogin.onclick = () => liff.login();
    } else {
      await showProfile();
      btnLogout.style.display = "inline-block";
      btnLogout.onclick = () => liff.logout();
    }
  } catch (err) {
    console.error(err);
    status.textContent = "เกิดข้อผิดพลาด: " + err.message;
  }
}

main();
