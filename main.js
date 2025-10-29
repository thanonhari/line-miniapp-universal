const liffId = "2008386498-JrAadEz1"; // 👈 ใส่ LIFF ID ของคุณ

function mobileCheck() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function showProfile() {
  const profile = await liff.getProfile();
  document.getElementById("profile").innerHTML = `
    <img src="${profile.pictureUrl}" width="100">
    <h2>${profile.displayName}</h2>
    <p>User ID: ${profile.userId}</p>
  `;
}

async function main() {
  const status = document.getElementById("status");
  const btnLogin = document.getElementById("btnLogin");

  try {
    if (liff.isInClient()) {
      status.textContent = "เปิดใน LINE App";
      await liff.init({ liffId });
      await showProfile();
    } else if (mobileCheck()) {
      status.textContent = "กำลังเปิดใน LINE App...";
      window.location.href = `line://app/${liffId}`;
    } else {
      status.textContent = "เปิดใน browser บนคอมพิวเตอร์";
      await liff.init({ liffId, withLoginOnExternalBrowser: true });
      if (!liff.isLoggedIn()) {
        btnLogin.style.display = "inline-block";
        btnLogin.onclick = () => liff.login();
      } else {
        await showProfile();
      }
    }
  } catch (err) {
    console.error(err);
    status.textContent = "เกิดข้อผิดพลาด: " + err.message;
  }
}

main();
