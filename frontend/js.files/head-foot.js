  // ============================
  // Globals
  // ============================
  const user = JSON.parse(sessionStorage.getItem('user')) || null;
  const userId = user?.userId || user?.user_id;
  const defaultProfile = 'img/profile-logo.jpg'; // fallback image

  // -----------------------------
  // Side Panel Toggle
  // -----------------------------
  function toggleSidePanel() {
    document.querySelector('.side-panel').classList.toggle('open');
  }

  /* Accordion submenu for side panel */
  document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('.side-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', function(){
        const submenu = this.nextElementSibling;

        // Close other submenus
        document.querySelectorAll('.side-submenu').forEach(sm => {
          if(sm !== submenu){
            sm.style.maxHeight = null;
          }
        });

        // Toggle current submenu
        if(submenu.style.maxHeight){
          submenu.style.maxHeight = null;
        } else {
          submenu.style.maxHeight = submenu.scrollHeight + "px";
        }
      });
    });
  });

  // ============================
  // Populate Header & Side Panel
  // ============================
  function populateHeaderSide(u) {
    const fullName = u?.name || 'Guest User';
    const username = u?.username ? `@${u.username}` : '@guest';
    const profileImg = u?.profileUrl || defaultProfile;

    document.getElementById('full-name').innerText = fullName;
    document.getElementById('username-display').innerText = username;
    document.getElementById('logoutLink').style.display = u ? 'block' : 'none';
    document.getElementById('logoutLinkMobile').style.display = u ? 'block' : 'none';

    document.querySelector('.panel-user-info').innerHTML = `
      <img src="${profileImg}" onerror="this.src='${defaultProfile}'" class="profile-logo-slide" alt="Profile">
      <p><strong>Name:</strong> ${fullName}</p>
      <p><strong>Username:</strong> ${username}</p>
    `;

    const profileDropdownImg = document.querySelector('.profile-area img');
    if(profileDropdownImg){
      profileDropdownImg.src = profileImg;
      profileDropdownImg.onerror = function(){ this.src = defaultProfile; }
    }
  }

    
// ============================
// Logout
// ============================
function deleteCookie(name) {
  document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}

document.querySelectorAll('#logoutLink, #logoutLinkMobile').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    
    // Clear sessionStorage
    sessionStorage.removeItem('user');

    // Clear cookie
    deleteCookie('user');

    // Optional: clear user info UI
    showUserInfo(null);

    alert("Logged out successfully");
    window.location.href = "index.html"; // redirect to login page
  });
});



