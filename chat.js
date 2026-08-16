// ========== نظام الدردشة المباشرة (Chat System) ==========
// يتضمن: رسائل فورية، typing indicator، emojis، صور مضمنة، صوت إشعارات
// ملاحظة: تم تحديث هذا الملف لاستخدام واجهات Firebase المعيارية (Modular SDK)

import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  getDocs,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

class ChatManager {
  constructor(db, storage, auth) {
    this.db = db; // Firestore instance (modular)
    this.storage = storage; // Storage instance (modular)
    this.auth = auth; // Auth instance
    this.currentUser = null;
    this.chatContainer = document.getElementById("chat-messages");
    this.inputField = document.getElementById("chat-input");
    this.sendBtn = document.getElementById("chat-send");
    this.attachImageBtn = document.getElementById("chat-attach-image");
    this.emojiPickerBtn = document.getElementById("chat-emoji-picker");
    this.emojiPanel = document.getElementById("emoji-panel");
    this.chatPanel = document.getElementById("chat-panel");
    this.typingIndicator = document.getElementById("typing-indicator");
    this.messageCount = document.getElementById("chat-badge");

    this.setupListeners();
    this.preloadAudio();
  }

  // استماع لتغييرات المستخدم
  setupAuthListener() {
    // يبقى فارغاً: index.html يمرر المستخدم عبر setCurrentUser
  }

  setupListeners() {
    // إرسال الرسالة
    this.sendBtn.addEventListener("click", () => this.sendMessage());
    this.inputField.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // مؤشر "يكتب"
    this.inputField.addEventListener("input", () => {
      this.setTypingStatus(true);
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.setTypingStatus(false);
      }, 2000);
    });

    // إرفاق صورة
    this.attachImageBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.sendImageMessage(file);
        }
      };
      input.click();
    });

    // لوحة الرموز التعبيرية
    this.emojiPickerBtn.addEventListener("click", () => {
      this.emojiPanel.classList.toggle("hidden");
    });

    // إضافة رموز تعبيرية مسبقة
    this.setupEmojiPicker();
  }

  // إعداد لوحة الرموز التعبيرية
  setupEmojiPicker() {
    const emojis = [
      "❤️", "😍", "😂", "😘", "🎉", "🌹", "💕", "✨",
      "🎁", "🌙", "⭐", "🔥", "😘", "💑", "👫", "💏"
    ];

    this.emojiPanel.innerHTML = emojis.map(emoji => `
      <button type="button" class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
    `).join("");

    this.emojiPanel.querySelectorAll(".emoji-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.inputField.value += btn.dataset.emoji;
        this.inputField.focus();
        this.emojiPanel.classList.add("hidden");
      });
    });
  }

  // تحديد حالة الكتابة (typing indicator)
  async setTypingStatus(isTyping) {
    try {
      if (!this.currentUser) return;
      const userDocRef = doc(this.db, "users", this.currentUser.uid);
      // حاول التحديث، وإذا لم يكن المستند موجوداً فأنشئه
      try {
        await updateDoc(userDocRef, {
          isTyping: isTyping,
          lastSeen: new Date(),
        });
      } catch (err) {
        // إذا فشل التحديث (عدم وجود المستند)، قم بإنشاء مستند ببيانات أساسية
        await setDoc(userDocRef, {
          isTyping: isTyping,
          lastSeen: new Date(),
          uid: this.currentUser.uid,
          displayName: this.currentUser.displayName || null,
        }, { merge: true });
      }
    } catch (err) {
      console.error("خطأ في تحديث حالة الكتابة:", err);
    }
  }

  // إرسال رسالة نصية
  async sendMessage() {
    const text = (this.inputField.value || "").trim();
    if (!text) return;

    this.inputField.disabled = true;
    this.sendBtn.disabled = true;

    try {
      await addDoc(collection(this.db, "messages"), {
        text: text,
        senderId: this.currentUser?.uid || null,
        senderName: this.currentUser?.displayName || "مستخدم",
        timestamp: new Date(),
        type: "text",
        read: false,
      });

      this.inputField.value = "";
      this.inputField.focus();
      this.setTypingStatus(false);
    } catch (err) {
      alert("فشل إرسال الرسالة");
      console.error(err);
    } finally {
      this.inputField.disabled = false;
      this.sendBtn.disabled = false;
    }
  }

  // إرسال صورة
  async sendImageMessage(file) {
    this.sendBtn.disabled = true;
    const originalText = this.sendBtn.textContent;
    this.sendBtn.textContent = "جارٍ الرفع...";

    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^\\w.\\-]/g, "_")}`;
      const path = `chat/${fileName}`;
      const imgRef = storageRef(this.storage, path);

      await uploadBytes(imgRef, file);
      const imageUrl = await getDownloadURL(imgRef);

      await addDoc(collection(this.db, "messages"), {
        imageUrl: imageUrl,
        imagePath: path,
        senderId: this.currentUser?.uid || null,
        senderName: this.currentUser?.displayName || "مستخدم",
        timestamp: new Date(),
        type: "image",
        read: false,
      });

      this.playNotificationSound();
    } catch (err) {
      alert("فشل رفع الصورة");
      console.error(err);
    } finally {
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = originalText;
    }
  }

  // استقبال الرسائل (Realtime listener)
  listenToMessages() {
    const q = query(
      collection(this.db, "messages"),
      orderBy("timestamp", "asc"),
      limit(100)
    );

    onSnapshot(q, (snapshot) => {
      this.chatContainer.innerHTML = "";
      const messages = [];

      snapshot.forEach((docSnap) => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
      });

      messages.forEach((msg, index) => {
        const isOwn = msg.senderId === this.currentUser?.uid;
        const messageEl = this.renderMessage(msg, isOwn);
        this.chatContainer.appendChild(messageEl);

        // تشغيل صوت للرسالة الجديدة القادمة من الطرف الآخر
        if (!isOwn && index === messages.length - 1) {
          this.playNotificationSound();
        }
      });

      // التمرير التلقائي إلى آخر رسالة
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      this.updateMessageCount();
    });
  }

  // عرض الرسالة
  renderMessage(msg, isOwn) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${isOwn ? "own" : "other"}`;

    const timeObj = msg.timestamp?.toDate ? msg.timestamp.toDate() : (msg.timestamp instanceof Date ? msg.timestamp : new Date());
    const timeFormatted = timeObj ? this.formatTime(timeObj) : "الآن";

    let content = "";
    if (msg.type === "image") {
      content = `<img src="${msg.imageUrl}" alt="صورة" class="chat-image" />`;
    } else {
      content = `<p class="chat-text">${this.escapeHtml(msg.text || "")}</p>`;
    }

    messageDiv.innerHTML = `
      <div class="chat-message-bubble">
        ${!isOwn ? `<p class="chat-sender-name">${this.escapeHtml(msg.senderName || "")}</p>` : ""}
        ${content}
        <span class="chat-time">${timeFormatted}</span>
      </div>
      ${isOwn ? `<button class="chat-delete-btn" data-msg-id="${msg.id}" title="حذف">✕</button>` : ""}
    `;

    // حذف الرسالة
    messageDiv.querySelector(".chat-delete-btn")?.addEventListener("click", async () => {
      if (confirm("هل تريد حذف هذه الرسالة؟")) {
        try {
          if (msg.imagePath) {
            await deleteObject(storageRef(this.storage, msg.imagePath)).catch(() => {});
          }
          await deleteDoc(doc(this.db, "messages", msg.id));
        } catch (err) {
          alert("فشل حذف الرسالة");
        }
      }
    });

    // فتح الصورة في lightbox
    messageDiv.querySelector(".chat-image")?.addEventListener("click", () => {
      this.openImageLightbox(msg.imageUrl);
    });

    return messageDiv;
  }

  // تنسيق الوقت
  formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "الآن";
    if (minutes < 60) return `${minutes}د`;
    if (hours < 24) return `${hours}س`;
    if (days < 7) return `${days}ا`;

    return date.toLocaleDateString("ar-EG");
  }

  // تشغيل صوت الإشعار
  preloadAudio() {
    this.notificationAudio = new Audio("data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==");
  }

  playNotificationSound() {
    try {
      this.notificationAudio.currentTime = 0;
      this.notificationAudio.play().catch(() => {});
    } catch (err) {
      console.log("لا يمكن تشغيل الصوت");
    }
  }

  // تحديث عدد الرسائل غير المقروءة
  async updateMessageCount() {
    try {
      if (!this.currentUser) return;
      const q = query(
        collection(this.db, "messages"),
        where("read", "==", false),
        where("senderId", "!=", this.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const count = snapshot.size;
      if (count > 0) {
        this.messageCount.textContent = count;
        this.messageCount.classList.remove("hidden");
      } else {
        this.messageCount.classList.add("hidden");
      }
    } catch (err) {
      console.error("خطأ أثناء تحديث عداد الرسائل:", err);
    }
  }

  // فتح صورة في lightbox
  openImageLightbox(url) {
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    lightboxImg.src = url;
    lightbox.classList.remove("hidden");
  }

  // تجنب XSS
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // تعيين المستخدم الحالي
  setCurrentUser(user) {
    this.currentUser = user;
    if (user) {
      this.listenToMessages();
    }
  }
}

export default ChatManager;
