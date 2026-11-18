
/* =========================================================
   JV — A WORLD OF YOUR OWN
   Personal social space
   Version 1.0
   ========================================================= */

"use strict";

/* =========================================================
   01. DATABASE
   ========================================================= */

const DB_NAME = "JVPersonalSpace";
const DB_VERSION = 1;
const STORE_NAME = "records";

let db;
let currentUser = null;
let currentPage = "homePage";
let activePostId = null;
let activeEditorType = "";
let selectedMedia = [];
let musicTracks = [];
let currentTrack = 0;
let objectURLs = [];

const $ = id => document.getElementById(id);

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function saveRecord(record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction.objectStore(STORE_NAME).put(record);

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

function getRecord(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllRecords() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function recordsOf(type) {
  return getAllRecords().then(records =>
    records.filter(record =>
      record.type === type &&
      record.owner === currentUser?.email
    )
  );
}

/* =========================================================
   02. DEFAULT PROFILE
   ========================================================= */

const DEFAULT_PROFILE = {
  type: "profile",
  id: "main-profile",
  owner: "",
  name: "ANJI",
  bio: "hi hi hi :;",
  picture: null,
  followers: "12M",
  following: "1.2K",
  hearts: "9.8M",
  createdAt: Date.now()
};

let profile = { ...DEFAULT_PROFILE };

async function loadProfile() {
  const saved = await getRecord("profile-" + currentUser.email);

  if (saved) {
    profile = saved;
  } else {
    profile = {
      ...DEFAULT_PROFILE,
      id: "profile-" + currentUser.email,
      owner: currentUser.email
    };

    await saveRecord(profile);
  }

  renderProfile();
}

function renderProfile() {
  $("profileName").innerHTML =
    `${escapeHTML(profile.name)}
    <span class="verified-badge">✓</span>`;

  $("profileBio").textContent = profile.bio;

  $("followerCount").textContent = profile.followers;
  $("followingCount").textContent = profile.following;
  $("heartCount").textContent = profile.hearts;

  if (profile.picture) {
    const url = URL.createObjectURL(profile.picture);
    objectURLs.push(url);

    $("profilePicture").src = url;
  }

  document.querySelectorAll(".mini-avatar").forEach(img => {
    if (profile.picture) {
      img.src = $("profilePicture").src;
    }
  });
}

/* =========================================================
   03. PROFILE PICTURE REPLACEMENT
   ========================================================= */

$("profilePictureInput").addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select an image.");
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showToast("Image is too large. Maximum: 15 MB.");
    return;
  }

  profile.picture = file;

  await saveRecord(profile);

  renderProfile();

  showToast("Profile picture updated!");

  event.target.value = "";
});

/* =========================================================
   04. PROFILE EDITOR
   ========================================================= */

$("editProfileButton").addEventListener("click", () => {
  $("editName").value = profile.name;
  $("editBio").value = profile.bio;

  openModal("profileEditor");
});

$("saveProfileButton").addEventListener("click", async () => {
  const name = $("editName").value.trim();
  const bio = $("editBio").value.trim();

  if (!name) {
    showToast("Please enter a display name.");
    return;
  }

  profile.name = name;
  profile.bio = bio;

  await saveRecord(profile);

  renderProfile();
  closeModal("profileEditor");

  showToast("Profile updated!");
});

/* =========================================================
   05. LOCAL ACCOUNT PROTOTYPE
   ========================================================= */

let authMode = "login";

async function passwordHash(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

$("loginTab").addEventListener("click", () => {
  authMode = "login";
  updateAuthTabs();
});

$("signupTab").addEventListener("click", () => {
  authMode = "signup";
  updateAuthTabs();
});

function updateAuthTabs() {
  $("loginTab").classList.toggle(
    "active",
    authMode === "login"
  );

  $("signupTab").classList.toggle(
    "active",
    authMode === "signup"
  );

  $("authSubmit").textContent =
    authMode === "login" ? "Enter JV" : "Create account";

  $("authPassword").autocomplete =
    authMode === "login" ? "current-password" : "new-password";
}

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;

  if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
    $("authMessage").textContent =
      "Please use a Gmail address.";
    return;
  }

  if (password.length < 8) {
    $("authMessage").textContent =
      "Password must contain at least 8 characters.";
    return;
  }

  try {
    const accountId = "account-" + email;
    const existing = await getRecord(accountId);
    const hash = await passwordHash(password);

    if (authMode === "signup") {
      if (existing) {
        $("authMessage").textContent =
          "An account already exists.";
        return;
      }

      await saveRecord({
        id: accountId,
        type: "account",
        email,
        passwordHash: hash,
        createdAt: Date.now()
      });

      $("authMessage").textContent =
        "Account created! You can now log in.";

      authMode = "login";
      updateAuthTabs();
      return;
    }

    if (!existing || existing.passwordHash !== hash) {
      $("authMessage").textContent =
        "Incorrect email or password.";
      return;
    }

    await enterApp(email);

  } catch (error) {
    console.error(error);
    showToast("Something went wrong.");
  }
});

async function enterApp(email) {
  currentUser = { email };

  sessionStorage.setItem("JV_SESSION", email);

  $("authScreen").classList.add("hidden");
  $("mainApp").classList.remove("hidden");
  $("appLoader").classList.add("hidden");

  await loadProfile();
  await refreshAll();
}

async function restoreSession() {
  const email = sessionStorage.getItem("JV_SESSION");

  if (!email) {
    $("appLoader").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
    return;
  }

  const account = await getRecord("account-" + email);

  if (account) {
    await enterApp(email);
  } else {
    sessionStorage.removeItem("JV_SESSION");
    $("appLoader").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
  }
}

/* =========================================================
   06. NAVIGATION
   ========================================================= */

const pageNames = [
  "homePage",
  "animePage",
  "mangaPage",
  "musicPage",
  "storiesPage",
  "writingPage",
  "notesPage",
  "gamingPage",
  "draftsPage",
  "collectionsPage"
];

function navigateTo(pageId) {
  if (!pageNames.includes(pageId)) return;

  currentPage = pageId;

  pageNames.forEach(id => {
    const page = $(id);

    if (!page) return;

    page.classList.toggle("active", id === pageId);
    page.classList.toggle("hidden", id !== pageId);
  });

  document.querySelectorAll(".nav-item[data-page]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === pageId
      );
    });

  $("searchPanel").classList.add("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.querySelectorAll(".nav-item[data-page]")
  .forEach(button => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

$("profileShortcut").addEventListener("click", () => {
  navigateTo("homePage");

  $("profilePicture").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
});

/* =========================================================
   07. MODALS AND MENUS
   ========================================================= */

function openModal(id) {
  $(id)?.classList.remove("hidden");
}

function closeModal(id) {
  $(id)?.classList.add("hidden");
}

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    closeModal(button.dataset.close);
  });
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      modal.classList.add("hidden");
    }
  });
});

$("createButton").addEventListener("click", () => {
  $("createMenu").classList.remove("hidden");
});

$("createMenu").addEventListener("click", event => {
  const button = event.target.closest("[data-create]");

  if (!button) return;

  closeModal("createMenu");

  handleCreate(button.dataset.create);
});

/* =========================================================
   08. CREATE MENU ACTIONS
   ========================================================= */

function handleCreate(type) {
  switch (type) {
    case "post":
      openPostEditor();
      break;

    case "anime":
      openUniversalEditor("anime");
      break;

    case "manga":
      openUniversalEditor("manga");
      break;

    case "music":
      $("musicUpload").click();
      navigateTo("musicPage");
      break;

    case "story":
      openUniversalEditor("story");
      break;

    case "writing":
      openUniversalEditor("writing");
      break;

    case "note":
      openUniversalEditor("note");
      break;

    case "gaming":
      $("gamingUpload").click();
      navigateTo("gamingPage");
      break;

    case "collection":
      openUniversalEditor("collection");
      break;
  }
}

$("openCreatePost").addEventListener(
  "click",
  openPostEditor
);

$("quickPhotoButton").addEventListener(
  "click",
  openPostEditor
);

$("quickVideoButton").addEventListener(
  "click",
  openPostEditor
);

$("quickWriteButton").addEventListener(
  "click",
  () => openUniversalEditor("writing")
);

$("addAnimeList").addEventListener(
  "click",
  () => openUniversalEditor("anime")
);

$("addMangaList").addEventListener(
  "click",
  () => openUniversalEditor("manga")
);

$("createStoryButton").addEventListener(
  "click",
  () => openUniversalEditor("story")
);

$("createWritingButton").addEventListener(
  "click",
  () => openUniversalEditor("writing")
);

$("createNoteButton").addEventListener(
  "click",
  () => openUniversalEditor("note")
);

$("createCollectionButton").addEventListener(
  "click",
  () => openUniversalEditor("collection")
);

/* =========================================================
   09. POST EDITOR
   ========================================================= */

function openPostEditor() {
  selectedMedia = [];
  $("postCaption").value = "";
  $("postPreview").innerHTML = "";
  $("postMediaInput").value = "";

  openModal("postEditor");
}

$("postMediaInput").addEventListener("change", event => {
  selectedMedia = [
    ...selectedMedia,
    ...Array.from(event.target.files)
  ];

  renderPostPreview();
  event.target.value = "";
});

function renderPostPreview() {
  $("postPreview").innerHTML = "";

  selectedMedia.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const url = URL.createObjectURL(file);
    objectURLs.push(url);

    const media = document.createElement(
      file.type.startsWith("video/") ? "video" : "img"
    );

    media.src = url;

    if (media.tagName === "VIDEO") {
      media.controls = true;
    }

    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedMedia.splice(index, 1);
      renderPostPreview();
    });

    wrapper.append(media, remove);
    $("postPreview").append(wrapper);
  });
}

$("savePostDraft").addEventListener("click", async () => {
  await saveRecord({
    id: createId(),
    type: "draft",
    category: "post",
    owner: currentUser.email,
    caption: $("postCaption").value,
    media: selectedMedia,
    createdAt: Date.now()
  });

  closeModal("postEditor");
  await renderDrafts();

  showToast("Post saved to drafts.");
});

$("publishPost").addEventListener("click", async () => {
  const caption = $("postCaption").value.trim();

  if (!caption && selectedMedia.length === 0) {
    showToast("Add a picture or write something first.");
    return;
  }

  const post = {
    id: createId(),
    type: "post",
    owner: currentUser.email,
    caption,
    media: selectedMedia,
    likes: 5000000,
    comments: [],
    createdAt: Date.now()
  };

  await saveRecord(post);

  selectedMedia = [];

  closeModal("postEditor");

  navigateTo("homePage");

  await renderFeed();

  showToast("Your post has been published!");
});

/* =========================================================
   10. POST FEED
   ========================================================= */

async function renderFeed() {
  const posts = await recordsOf("post");

  posts.sort((a, b) => b.createdAt - a.createdAt);

  $("feedContainer").innerHTML = "";

  if (!posts.length) {
    $("feedContainer").innerHTML = `
      <div class="empty-feed glass">
        <span>✧</span>
        <h3>Your world starts here.</h3>
        <p>Every picture, thought, and memory has a place.</p>
      </div>
    `;
    return;
  }

  posts.forEach(post => {
    const article = document.createElement("article");
    article.className = "post-card glass";

    const header = document.createElement("div");
    header.className = "post-header";

    const avatar = document.createElement("img");
    avatar.className = "mini-avatar";
    avatar.alt = "Profile";

    if (profile.picture) {
      avatar.src = $("profilePicture").src;
    } else {
      avatar.src = "./icons/icon-192.png";
    }

    const identity = document.createElement("div");
    identity.innerHTML = `
      <strong>${escapeHTML(profile.name)}</strong>
      <small>✓ Verified · ${formatDate(post.createdAt)}</small>
    `;

    const menu = document.createElement("button");
    menu.textContent = "•••";
    menu.className = "post-menu";
    menu.addEventListener("click", () => {
      showPostActions(post.id);
    });

    header.append(avatar, identity, menu);

    const caption = document.createElement("p");
    caption.className = "post-caption";
    caption.textContent = post.caption || "";

    const mediaGrid = document.createElement("div");
    mediaGrid.className = "post-media";

    (post.media || []).forEach(file => {
      const url = URL.createObjectURL(file);
      objectURLs.push(url);

      const media = document.createElement(
        file.type.startsWith("video/") ? "video" : "img"
      );

      media.src = url;
      media.className = "post-media-item";

      if (media.tagName === "VIDEO") {
        media.controls = true;
      }

      mediaGrid.append(media);
    });

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const like = document.createElement("button");
    like.innerHTML = `♥ <span>${formatNumber(post.likes)}</span>`;

    like.addEventListener("click", () => {
      showToast("You already love this post ♥");
    });

    const comment = document.createElement("button");
    comment.textContent =
      `♡ Comments (${(post.comments || []).length})`;

    comment.addEventListener("click", () => {
      openPostDetail(post.id);
    });

    const detail = document.createElement("button");
    detail.textContent = "View post";
    detail.addEventListener("click", () => {
      openPostDetail(post.id);
    });

    actions.append(like, comment, detail);

    article.append(header, caption, mediaGrid, actions);

    $("feedContainer").append(article);
  });
}

function formatNumber(number) {
  if (number >= 1000000) {
    return (number / 1000000).toFixed(1) + "M";
  }

  if (number >= 1000) {
    return (number / 1000).toFixed(1) + "K";
  }

  return String(number);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}

/* =========================================================
   11. POST ACTIONS
   ========================================================= */

async function showPostActions(id) {
  const post = await getRecord(id);

  if (!post) return;

  const choice = prompt(
    "POST OPTIONS\n\n" +
    "1 - Edit caption\n" +
    "2 - Delete post\n" +
    "3 - Cancel"
  );

  if (choice === "1") {
    const caption = prompt(
      "Edit your caption:",
      post.caption
    );

    if (caption !== null) {
      post.caption = caption;
      await saveRecord(post);
      await renderFeed();
      showToast("Caption updated.");
    }
  }

  if (choice === "2") {
    if (confirm("Delete this post permanently?")) {
      await deleteRecord(id);
      await renderFeed();
      showToast("Post deleted.");
    }
  }
}

/* =========================================================
   12. COMMENTS
   ========================================================= */

async function openPostDetail(id) {
  activePostId = id;

  const post = await getRecord(id);

  if (!post) return;

  $("detailContent").innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = profile.name + "'s post";

  const caption = document.createElement("p");
  caption.textContent = post.caption || "";

  $("detailContent").append(heading, caption);

  $("commentList").innerHTML = "";

  (post.comments || []).forEach(comment => {
    const item = document.createElement("div");
    item.className = "comment-item";

    const name = document.createElement("strong");
    name.textContent = comment.name;

    const message = document.createElement("p");
    message.textContent = comment.text;

    item.append(name, message);
    $("commentList").append(item);
  });

  openModal("detailModal");
}

$("commentForm").addEventListener("submit", async event => {
  event.preventDefault();

  const message = $("commentInput").value.trim();

  if (!message || !activePostId) return;

  const post = await getRecord(activePostId);

  if (!post) return;

  post.comments = post.comments || [];

  post.comments.push({
    id: createId(),
    name: profile.name,
    text: message,
    createdAt: Date.now()
  });

  await saveRecord(post);

  $("commentInput").value = "";

  await openPostDetail(activePostId);
  await renderFeed();

  showToast("Comment added.");
});

/* =========================================================
   13. UNIVERSAL CONTENT EDITOR
   ========================================================= */

const editorTitles = {
  anime: "New anime collection",
  manga: "New manga collection",
  story: "Create a story",
  writing: "Write something",
  note: "New reflection note",
  collection: "Create collection"
};

function openUniversalEditor(type) {
  activeEditorType = type;

  $("universalEditorTitle").textContent =
    editorTitles[type] || "Create";

  $("universalTitle").value = "";
  $("universalContent").value = "";
  $("universalCover").value = "";

  $("universalContent").placeholder =
    type === "story"
      ? "Write your first chapter..."
      : type === "anime" || type === "manga"
        ? "Add titles, summaries, or reading notes..."
        : "Write here...";

  openModal("universalEditor");
}

async function saveUniversalContent(isDraft = false) {
  const title = $("universalTitle").value.trim();
  const content = $("universalContent").value.trim();
  const cover = $("universalCover").files[0] || null;

  if (!title && !content) {
    showToast("Add a title or some content first.");
    return;
  }

  const type = isDraft ? "draft" : activeEditorType;

  const record = {
    id: createId(),
    type,
    category: activeEditorType,
    owner: currentUser.email,
    title,
    content,
    cover,
    createdAt: Date.now()
  };

  await saveRecord(record);

  closeModal("universalEditor");

  await refreshAll();

  showToast(isDraft ? "Draft saved." : "Saved successfully!");
}

$("saveUniversal").addEventListener("click", () => {
  saveUniversalContent(false);
});

$("saveUniversalDraft").addEventListener("click", () => {
  saveUniversalContent(true);
});

/* =========================================================
   14. COLLECTION RENDERING
   ========================================================= */

const collectionTargets = {
  anime: "animeCollections",
  manga: "mangaCollections",
  story: "storyLibrary",
  writing: "writingLibrary",
  note: "notesLibrary",
  collection: "generalCollections"
};

async function renderCollection(type) {
  const target = $(collectionTargets[type]);

  if (!target) return;

  const items = await recordsOf(type);

  items.sort((a, b) => b.createdAt - a.createdAt);

  target.innerHTML = "";

  if (!items.length) {
    target.innerHTML =
      `<p class="empty-message">Nothing here yet. Create your first one!</p>`;
    return;
  }

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "collection-card glass";

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled";

    const content = document.createElement("p");
    content.textContent = item.content || "";

    const date = document.createElement("small");
    date.textContent = formatDate(item.createdAt);

    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editUniversalItem(item);
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (confirm("Delete this item?")) {
        await deleteRecord(item.id);
        await renderCollection(type);
        showToast("Item deleted.");
      }
    });

    card.append(title, content, date, edit, remove);

    target.append(card);
  });
}

async function editUniversalItem(item) {
  activeEditorType = item.type;

  $("universalEditorTitle").textContent =
    "Edit " + (item.title || item.type);

  $("universalTitle").value = item.title || "";
  $("universalContent").value = item.content || "";

  openModal("universalEditor");

  const saveButton = $("saveUniversal");

  saveButton.onclick = async () => {
    item.title = $("universalTitle").value.trim();
    item.content = $("universalContent").value.trim();

    await saveRecord(item);

    saveButton.onclick = null;

    closeModal("universalEditor");

    await refreshAll();

    showToast("Changes saved.");
  };
}

/* =========================================================
   15. MUSIC ROOM
   ========================================================= */

$("uploadMusicButton").addEventListener("click", () => {
  $("musicUpload").click();
});

$("musicUpload").addEventListener("change", async event => {
  const files = Array.from(event.target.files);

  for (const file of files) {
    if (!file.type.startsWith("audio/")) continue;

    await saveRecord({
      id: createId(),
      type: "music",
      owner: currentUser.email,
      title: file.name.replace(/\.[^/.]+$/, ""),
      file,
      createdAt: Date.now()
    });
  }

  event.target.value = "";

  await renderMusic();

  showToast("Music added to your library.");
});

async function renderMusic() {
  musicTracks = await recordsOf("music");

  musicTracks.sort((a, b) => b.createdAt - a.createdAt);

  $("musicLibrary").innerHTML = "";

  if (!musicTracks.length) {
    $("musicLibrary").innerHTML =
      `<p class="empty-message">Your music library is waiting.</p>`;
    return;
  }

  musicTracks.forEach((track, index) => {
    const row = document.createElement("div");
    row.className = "music-row glass";

    const title = document.createElement("span");
    title.textContent = track.title;

    const play = document.createElement("button");
    play.textContent = "▶";

    play.addEventListener("click", () => {
      playTrack(index);
    });

    const remove = document.createElement("button");
    remove.textContent = "×";

    remove.addEventListener("click", async () => {
      if (confirm("Remove this audio?")) {
        await deleteRecord(track.id);
        await renderMusic();
        showToast("Audio removed.");
      }
    });

    row.append(title, play, remove);

    $("musicLibrary").append(row);
  });
}

function playTrack(index) {
  if (!musicTracks[index]) return;

  currentTrack = index;

  const track = musicTracks[index];

  const audio = $("audioPlayer");

  const url = URL.createObjectURL(track.file);
  objectURLs.push(url);

  audio.src = url;

  $("musicTitle").textContent = track.title;
  $("musicArtist").textContent = profile.name;

  audio.play().catch(() => {
    showToast("Press play to start your music.");
  });

  $("playPauseButton").textContent = "Ⅱ";
}

$("playPauseButton").addEventListener("click", () => {
  const audio = $("audioPlayer");

  if (!audio.src) {
    showToast("Choose a song first.");
    return;
  }

  if (audio.paused) {
    audio.play();
    $("playPauseButton").textContent = "Ⅱ";
  } else {
    audio.pause();
    $("playPauseButton").textContent = "▶";
  }
});

$("nextTrack").addEventListener("click", () => {
  if (!musicTracks.length) return;

  playTrack((currentTrack + 1) % musicTracks.length);
});

$("previousTrack").addEventListener("click", () => {
  if (!musicTracks.length) return;

  playTrack(
    (currentTrack - 1 + musicTracks.length) %
    musicTracks.length
  );
});

$("audioPlayer").addEventListener("ended", () => {
  if (musicTracks.length) {
    playTrack((currentTrack + 1) % musicTracks.length);
  }
});

/* =========================================================
   16. PLAYLISTS
   ========================================================= */

$("createPlaylistButton").addEventListener("click", async () => {
  const name = prompt("Give your playlist a name:");

  if (!name?.trim()) return;

  await saveRecord({
    id: createId(),
    type: "playlist",
    owner: currentUser.email,
    title: name.trim(),
    tracks: [],
    createdAt: Date.now()
  });

  await renderPlaylists();

  showToast("Playlist created.");
});

async function renderPlaylists() {
  const playlists = await recordsOf("playlist");

  $("playlistContainer").innerHTML = "";

  playlists.forEach(playlist => {
    const row = document.createElement("div");
    row.className = "playlist-card glass";

    const title = document.createElement("h3");
    title.textContent = "♫ " + playlist.title;

    const add = document.createElement("button");
    add.textContent = "Add current song";

    add.addEventListener("click", async () => {
      const track = musicTracks[currentTrack];

      if (!track) {
        showToast("Play a song first.");
        return;
      }

      playlist.tracks = playlist.tracks || [];

      if (!playlist.tracks.includes(track.id)) {
        playlist.tracks.push(track.id);
        await saveRecord(playlist);
        showToast("Added to playlist.");
      }
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete playlist";

    remove.addEventListener("click", async () => {
      if (confirm("Delete this playlist?")) {
        await deleteRecord(playlist.id);
        await renderPlaylists();
      }
    });

    row.append(title, add, remove);

    $("playlistContainer").append(row);
  });
}

/* =========================================================
   17. GAMING GALLERY
   ========================================================= */

$("uploadGamingButton").addEventListener("click", () => {
  $("gamingUpload").click();
});

$("gamingUpload").addEventListener("change", async event => {
  const files = Array.from(event.target.files);

  for (const file of files) {
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) continue;

    await saveRecord({
      id: createId(),
      type: "gaming",
      owner: currentUser.email,
      file,
      title: file.name,
      likes: 5000000,
      createdAt: Date.now()
    });
  }

  event.target.value = "";

  await renderGaming();

  showToast("Gaming memories uploaded!");
});

async function renderGaming() {
  const items = await recordsOf("gaming");

  $("gamingGallery").innerHTML = "";

  items.forEach(item => {
    const url = URL.createObjectURL(item.file);
    objectURLs.push(url);

    const media = document.createElement(
      item.file.type.startsWith("video/") ? "video" : "img"
    );

    media.src = url;
    media.className = "gallery-item";

    if (media.tagName === "VIDEO") {
      media.controls = true;
    }

    media.title = item.title;

    $("gamingGallery").append(media);
  });
}

/* =========================================================
   18. DRAFTS
   ========================================================= */

async function renderDrafts() {
  const drafts = await recordsOf("draft");

  $("draftLibrary").innerHTML = "";

  if (!drafts.length) {
    $("draftLibrary").innerHTML =
      `<p class="empty-message">No saved drafts.</p>`;
    return;
  }

  drafts.forEach(draft => {
    const card = document.createElement("div");
    card.className = "draft-card glass";

    const title = document.createElement("h3");
    title.textContent = draft.title || "Untitled draft";

    const content = document.createElement("p");
    content.textContent =
      draft.caption || draft.content || "Saved post";

    const remove = document.createElement("button");
    remove.textContent = "Delete";

    remove.addEventListener("click", async () => {
      await deleteRecord(draft.id);
      await renderDrafts();
      showToast("Draft deleted.");
    });

    card.append(title, content, remove);

    $("draftLibrary").append(card);
  });
}

/* =========================================================
   19. HIGHLIGHTS
   ========================================================= */

$("addHighlightButton").addEventListener("click", async () => {
  const name = prompt("Highlight name:");

  if (!name?.trim()) return;

  await saveRecord({
    id: createId(),
    type: "highlight",
    owner: currentUser.email,
    title: name.trim(),
    createdAt: Date.now()
  });

  await renderHighlights();
});

async function renderHighlights() {
  const items = await recordsOf("highlight");

  $("highlightsContainer").innerHTML = "";

  items.forEach(item => {
    const button = document.createElement("button");
    button.className = "highlight-item";
    button.textContent = "✦ " + item.title;

    button.addEventListener("click", async () => {
      if (confirm("Delete this highlight?")) {
        await deleteRecord(item.id);
        await renderHighlights();
      }
    });

    $("highlightsContainer").append(button);
  });

  if (!items.length) {
    $("highlightsContainer").innerHTML =
      `<p class="empty-message">Your memories will appear here.</p>`;
  }
}

/* =========================================================
   20. SEARCH
   ========================================================= */

$("searchToggle").addEventListener("click", () => {
  $("searchPanel").classList.toggle("hidden");

  if (!$("searchPanel").classList.contains("hidden")) {
    $("globalSearch").focus();
  }
});

$("globalSearch").addEventListener("input", async event => {
  const query = event.target.value.toLowerCase().trim();

  const results = $("searchResults");
  results.innerHTML = "";

  if (!query) return;

  const records = await getAllRecords();

  const matches = records.filter(item => {
    if (item.owner !== currentUser.email) return false;

    const text = [
      item.title || "",
      item.caption || "",
      item.content || "",
      item.category || ""
    ].join(" ").toLowerCase();

    return text.includes(query);
  });

  matches.forEach(item => {
    const result = document.createElement("button");

    result.className = "search-result";
    result.textContent = item.title || item.caption || item.type;

    result.addEventListener("click", () => {
      const destination = {
        post: "homePage",
        anime: "animePage",
        manga: "mangaPage",
        music: "musicPage",
        story: "storiesPage",
        writing: "writingPage",
        note: "notesPage",
        gaming: "gamingPage",
        draft: "draftsPage",
        collection: "collectionsPage"
      }[item.type];

      if (destination) navigateTo(destination);
    });

    results.append(result);
  });

  if (!matches.length) {
    results.textContent = "No matching memories found.";
  }
});

/* =========================================================
   21. NOTIFICATIONS
   ========================================================= */

$("notificationButton").addEventListener("click", () => {
  showToast("You're all caught up. ♡");
});

/* =========================================================
   22. FEED FILTER
   ========================================================= */

$("feedFilterButton").addEventListener("click", async () => {
  const posts = await recordsOf("post");

  const ordered = posts.sort(
    (a, b) => b.createdAt - a.createdAt
  );

  if (!ordered.length) {
    showToast("No posts yet.");
    return;
  }

  showToast("Showing your latest memories.");
});

/* =========================================================
   23. STORAGE INFORMATION
   ========================================================= */

async function checkStorage() {
  if (!navigator.storage?.estimate) return;

  try {
    const estimate = await navigator.storage.estimate();

    console.log("JV Storage:", {
      used: estimate.usage,
      quota: estimate.quota
    });
  } catch (error) {
    console.warn("Storage information unavailable.", error);
  }
}

async function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    const granted = await navigator.storage.persist();

    console.log("Persistent storage:", granted);
  }
}

/* =========================================================
   24. UTILITY FUNCTIONS
   ========================================================= */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function showToast(message) {
  const toast = document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;

  $("toastContainer").append(toast);

  setTimeout(() => {
    toast.classList.add("toast-visible");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("toast-visible");

    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

/* =========================================================
   25. REFRESH APPLICATION DATA
   ========================================================= */

async function refreshAll() {
  await Promise.all([
    renderFeed(),
    renderCollection("anime"),
    renderCollection("manga"),
    renderCollection("story"),
    renderCollection("writing"),
    renderCollection("note"),
    renderCollection("collection"),
    renderMusic(),
    renderPlaylists(),
    renderGaming(),
    renderDrafts(),
    renderHighlights()
  ]);

  await checkStorage();
}

/* =========================================================
   26. OFFLINE STATUS
   ========================================================= */

window.addEventListener("online", () => {
  showToast("You're back online.");
});

window.addEventListener("offline", () => {
  showToast("Offline mode activated.");
});

/* =========================================================
   27. CLEANUP
   ========================================================= */

window.addEventListener("pagehide", () => {
  objectURLs.forEach(url => URL.revokeObjectURL(url));
  objectURLs = [];
});

/* =========================================================
   28. APP INITIALIZATION
   ========================================================= */

async function initializeJV() {
  try {
    await openDatabase();

    await restoreSession();

    if (currentUser) {
      await requestPersistentStorage();
    }

    console.log(
      "%c JV — A WORLD OF YOUR OWN ",
      "background:#10291d;color:#d6c28a;padding:10px;font-size:16px;"
    );

  } catch (error) {
    console.error("JV initialization failed:", error);

    $("appLoader").classList.add("hidden");

    showToast("JV could not open its local database.");
  }
}

initializeJV();

/* =========================================================
   END OF JV JAVASCRIPT
   ========================================================= */
