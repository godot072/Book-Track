import { useState, useEffect, useMemo, useRef } from "react";
import { storage } from "./storage.js";
import { Plus, X, Star, Search, Trash2, Pencil, Quote, BookOpen, Library, Copy, Clock, Share2, Sparkles } from "lucide-react";

const SPINE_COLORS = [
  { bg: "#0FA89C", text: "#EAFBF8" },
  { bg: "#1670A0", text: "#E8F4FA" },
  { bg: "#0F8C7E", text: "#E6F8F4" },
  { bg: "#2A4E8C", text: "#EAEEF8" },
  { bg: "#178C99", text: "#E6F7F8" },
  { bg: "#3A9C7A", text: "#EDF8F1" },
  { bg: "#144E5C", text: "#DCF0F2" },
  { bg: "#5C8CA0", text: "#EFF6F8" },
];

const STATUS = {
  reading: { label: "읽는~중", color: "#FFB05C" },
  done: { label: "읽었~어", color: "#2DD4C7" },
  want: { label: "읽고~파", color: "#4A90D9" },
};

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}
function spineColor(seed) {
  return SPINE_COLORS[hashStr(seed) % SPINE_COLORS.length];
}
function spineHeight(seed) {
  return 172 + (hashStr(seed + "h") % 40);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function daysBetween(start, end) {
  if (!start || !end) return null;
  const d = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return d > 0 ? d : null;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
function compressImage(dataUrl, maxDim = 640, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

const emptyDraft = () => ({
  id: null,
  title: "",
  author: "",
  authorBio: "",
  description: "",
  cover: "",
  genre: "",
  status: "want",
  rating: 0,
  recommend: false,
  review: "",
  quotes: [],
  dateStarted: "",
  dateFinished: "",
  dateAdded: Date.now(),
});

export default function LibraryApp() {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // null = closed, object = editing/adding
  const [quoteInput, setQuoteInput] = useState("");
  const [toast, setToast] = useState("");
  const skipSaveRef = useRef(true);
  const [coverRecognizing, setCoverRecognizing] = useState(false);
  const coverInputRef = useRef(null);
  const [dragBookId, setDragBookId] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const dragRef = useRef(null); // { id, book, startX, startY, moved }
  const dragOverStatusRef = useRef(null);
  const [textAutofilling, setTextAutofilling] = useState(false);
  const [reviewPolishing, setReviewPolishing] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState("");
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const b = await storage.get("library-books");
        if (b) setBooks(JSON.parse(b.value));
      } catch (e) {}
      skipSaveRef.current = false;
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (skipSaveRef.current) return;
    storage.set("library-books", JSON.stringify(books)).catch(() => {});
  }, [books]);

  useEffect(() => {
    function handleMove(e) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > 10) {
        d.moved = true;
        setDragBookId(d.id);
      }
      if (d.moved) {
        e.preventDefault();
        setDragPos({ x: e.clientX, y: e.clientY });
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const zone = el && el.closest ? el.closest("[data-shelf-status]") : null;
        setDragOverStatus(zone ? zone.getAttribute("data-shelf-status") : null);
      }
    }
    function handleUp() {
      const d = dragRef.current;
      if (!d) return;
      if (d.moved) {
        setBooks((bs) => {
          const target = dragOverStatusRef.current;
          if (!target || target === d.book.status) return bs;
          return bs.map((b) => (b.id === d.id ? { ...b, status: target } : b));
        });
        if (dragOverStatusRef.current && dragOverStatusRef.current !== d.book.status) {
          showToast(`"${d.book.title}"을(를) ${STATUS[dragOverStatusRef.current].label} 책장으로 옮겼어요`);
        }
      } else {
        openDetail(d.book);
      }
      dragRef.current = null;
      setDragBookId(null);
      setDragOverStatus(null);
    }
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  useEffect(() => {
    dragOverStatusRef.current = dragOverStatus;
  }, [dragOverStatus]);

  function startDrag(e, book) {
    dragRef.current = { id: book.id, book, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  function saveDraft() {
    if (!draft.title.trim() || !draft.author.trim()) {
      showToast("제목과 저자를 입력해 주세요");
      return;
    }
    if (draft.id) {
      setBooks((bs) => bs.map((b) => (b.id === draft.id ? draft : b)));
      showToast("책 정보를 수정했어요");
    } else {
      setBooks((bs) => [{ ...draft, id: uid(), dateAdded: Date.now() }, ...bs]);
      setQuery("");
      setStatusFilter("all");
      showToast("서재에 책을 꽂았어요");
    }
    setDraft(null);
  }

  function deleteBook(id) {
    setBooks((bs) => bs.filter((b) => b.id !== id));
    setSelectedId(null);
    setDraft(null);
    showToast("책을 서재에서 뺐어요");
  }

  async function handleCoverFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !draft) return;

    let dataUrl;
    try {
      const raw = await fileToDataUrl(file);
      try {
        dataUrl = await compressImage(raw);
      } catch (compressErr) {
        dataUrl = raw;
      }
    } catch (err) {
      showToast("사진을 불러오지 못했어요");
      return;
    }

    setDraft((d) => (d ? { ...d, cover: dataUrl } : d));
    setCoverRecognizing(true);
    try {
      const base64 = dataUrl.split(",")[1];
      const response = await fetch("/.netlify/functions/recognize-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: "image/jpeg" }),
      });
      const parsed = await response.json();
      if (!response.ok) {
        throw new Error(parsed.error || "recognize failed");
      }
      setDraft((d) => {
        if (!d) return d;
        return {
          ...d,
          title: parsed.title && parsed.title.trim() ? parsed.title.trim() : d.title,
          author: parsed.author && parsed.author.trim() ? parsed.author.trim() : d.author,
          authorBio: parsed.authorBio && parsed.authorBio.trim() ? parsed.authorBio.trim() : d.authorBio,
          description: parsed.description && parsed.description.trim() ? parsed.description.trim() : d.description,
          genre: parsed.genre && parsed.genre.trim() ? parsed.genre.trim() : d.genre,
        };
      });
      showToast("사진에서 정보를 자동으로 입력했어요");
    } catch (err) {
      showToast("인식에 실패했어요. 직접 입력해 주세요");
    } finally {
      setCoverRecognizing(false);
      e.target.value = "";
    }
  }

  async function handleAutofillText() {
    if (!draft || !draft.title.trim()) {
      showToast("책 제목을 먼저 입력해 주세요");
      return;
    }
    setTextAutofilling(true);
    try {
      const response = await fetch("/.netlify/functions/autofill-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, author: draft.author }),
      });
      const parsed = await response.json();
      if (!response.ok) throw new Error(parsed.error || "autofill failed");
      setDraft((d) => {
        if (!d) return d;
        return {
          ...d,
          author: parsed.author && parsed.author.trim() ? parsed.author.trim() : d.author,
          authorBio: parsed.authorBio && parsed.authorBio.trim() ? parsed.authorBio.trim() : d.authorBio,
          description: parsed.description && parsed.description.trim() ? parsed.description.trim() : d.description,
          genre: parsed.genre && parsed.genre.trim() ? parsed.genre.trim() : d.genre,
        };
      });
      showToast("제목/저자로 정보를 채웠어요");
    } catch (err) {
      showToast("자동 채우기에 실패했어요");
    } finally {
      setTextAutofilling(false);
    }
  }

  async function handlePolishReview() {
    if (!draft || !draft.review.trim()) {
      showToast("다듬을 감상평을 먼저 입력해 주세요");
      return;
    }
    setReviewPolishing(true);
    try {
      const response = await fetch("/.netlify/functions/polish-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: draft.review, title: draft.title }),
      });
      const parsed = await response.json();
      if (!response.ok) throw new Error(parsed.error || "polish failed");
      if (parsed.polished) {
        setDraft((d) => (d ? { ...d, review: parsed.polished } : d));
        showToast("감상평을 다듬었어요");
      }
    } catch (err) {
      showToast("다듬기에 실패했어요");
    } finally {
      setReviewPolishing(false);
    }
  }

  async function openRecommend() {
    setRecommendOpen(true);
    setRecommendError("");
    if (books.length === 0) {
      setRecommendError("추천을 받으려면 서재에 책이 있어야 해요.");
      return;
    }
    setRecommendLoading(true);
    setRecommendations([]);
    try {
      const response = await fetch("/.netlify/functions/recommend-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: books.map((b) => ({
            title: b.title,
            author: b.author,
            genre: b.genre,
            status: b.status,
            rating: b.rating,
            recommend: b.recommend,
          })),
        }),
      });
      const parsed = await response.json();
      if (!response.ok) throw new Error(parsed.error || "recommend failed");
      setRecommendations(Array.isArray(parsed.recommendations) ? parsed.recommendations : []);
    } catch (err) {
      setRecommendError("추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRecommendLoading(false);
    }
  }

  function addQuote() {
    if (!quoteInput.trim()) return;
    setBooks((bs) =>
      bs.map((b) =>
        b.id === selectedId ? { ...b, quotes: [...(b.quotes || []), quoteInput.trim()] } : b
      )
    );
    setQuoteInput("");
  }
  function removeQuote(idx) {
    setBooks((bs) =>
      bs.map((b) =>
        b.id === selectedId
          ? { ...b, quotes: b.quotes.filter((_, i) => i !== idx) }
          : b
      )
    );
  }
  function setRating(bookId, val) {
    setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, rating: val } : b)));
  }

  function copyToClipboard(book) {
    const stars = "★".repeat(book.rating || 0) + "☆".repeat(5 - (book.rating || 0));
    const days = daysBetween(book.dateStarted, book.dateFinished);
    const lines = [
      `${book.title} - ${book.author}`,
      `평점: ${stars}`,
      days ? `${days}일 만에 완독` : null,
      "",
      "[감상평]",
      book.review || "(작성한 감상평 없음)",
    ];
    if (book.quotes && book.quotes.length) {
      lines.push("", "[인상 깊은 문장]");
      book.quotes.forEach((q) => lines.push(`- "${q}"`));
    }
    const text = lines.filter((l) => l !== null).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("감상평을 복사했어요"),
        () => showToast("복사에 실패했어요")
      );
    } else {
      showToast("이 브라우저에서는 복사를 지원하지 않아요");
    }
  }

  function bookShareText(book) {
    const stars = "★".repeat(book.rating || 0) + "☆".repeat(5 - (book.rating || 0));
    const lines = [
      `📖 ${book.title || "(제목 없음)"} - ${book.author || "저자 미상"}`,
      book.rating ? `평점: ${stars}` : null,
      book.genre ? `#${book.genre}` : null,
      "",
      book.description ? book.description : null,
      book.review ? `\n[감상평]\n${book.review}` : null,
    ];
    return lines.filter((l) => l !== null && l !== "").join("\n");
  }

  async function shareBook(book) {
    if (!book.title || !book.title.trim()) {
      showToast("공유할 책 제목을 먼저 입력해 주세요");
      return;
    }
    const text = bookShareText(book);
    if (navigator.share) {
      try {
        await navigator.share({ title: book.title, text });
      } catch (e) {
        // 사용자가 공유를 취소한 경우 등은 조용히 무시
      }
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("공유 내용을 복사했어요. 카카오톡에 붙여넣어 보내보세요"),
        () => showToast("공유에 실패했어요")
      );
    } else {
      showToast("이 기기에서는 공유하기를 지원하지 않아요");
    }
  }

  const activeBooks = books;
  const isReadOnly = false;
  const selectedBook = activeBooks.find((b) => b.id === selectedId);
  const otherByAuthor = selectedBook
    ? activeBooks.filter((b) => b.author === selectedBook.author && b.id !== selectedBook.id)
    : [];
  const selectedDays = selectedBook ? daysBetween(selectedBook.dateStarted, selectedBook.dateFinished) : null;

  const filtered = useMemo(() => {
    let list = [...activeBooks];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    const sorters = {
      recent: (a, b) => b.dateAdded - a.dateAdded,
      title: (a, b) => a.title.localeCompare(b.title, "ko"),
      author: (a, b) => a.author.localeCompare(b.author, "ko"),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    list.sort(sorters[sortBy]);
    return list;
  }, [activeBooks, query, statusFilter, sortBy]);

  const showFlat = query.trim() !== "" || statusFilter !== "all";

  const stats = useMemo(() => {
    const done = activeBooks.filter((b) => b.status === "done");
    const reading = activeBooks.filter((b) => b.status === "reading");
    const want = activeBooks.filter((b) => b.status === "want");
    const recommend = activeBooks.filter((b) => b.recommend);
    return { total: activeBooks.length, done: done.length, reading: reading.length, want: want.length, recommend: recommend.length };
  }, [activeBooks]);

  function openAdd() {
    setDraft(emptyDraft());
    setSelectedId(null);
  }
  function openEdit(book) {
    setDraft({ ...book });
    setSelectedId(null);
  }
  function openDetail(book) {
    setSelectedId(book.id);
    setDraft(null);
    setQuoteInput("");
  }

  function Spine({ book }) {
    const c = spineColor(book.id);
    const h = spineHeight(book.id);
    const isDragging = dragBookId === book.id;
    return (
      <div
        onPointerDown={(e) => startDrag(e, book)}
        title={`${book.title} · ${book.author}`}
        style={{
          alignSelf: "end",
          width: "100%",
          height: h,
          background: c.bg,
          border: "none",
          borderRadius: "3px 3px 2px 2px",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          position: "relative",
          padding: "10px 4px 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: isDragging ? 0.25 : 1,
          boxShadow: "inset 2px 0 0 rgba(255,255,255,0.08), inset -2px 0 0 rgba(0,0,0,0.25), 2px 3px 6px rgba(0,0,0,0.45), 0 0 16px rgba(45,212,199,0.12)",
          animation: "riseIn 0.5s ease backwards",
          animationDelay: (hashStr(book.id) % 6) * 0.04 + "s",
        }}
      >
        {book.status === "done" && (
          <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)" }}>
            <Star size={11} fill="#EAFBF8" color="#EAFBF8" />
          </div>
        )}
        {book.status === "reading" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 6,
              width: 10,
              height: 22,
              background: "#E88A3E",
              clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)",
            }}
          />
        )}
        <div
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            fontFamily: "'Song Myung', serif",
            fontWeight: 600,
            fontSize: 12.5,
            color: c.text,
            letterSpacing: "0.02em",
            maxHeight: h - 46,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {book.title}
        </div>
        <div
          style={{
            writingMode: "vertical-rl",
            fontFamily: "'Gothic A1', sans-serif",
            fontSize: 9.5,
            color: c.text,
            opacity: 0.72,
            whiteSpace: "nowrap",
            overflow: "hidden",
            maxHeight: 34,
            pointerEvents: "none",
          }}
        >
          {book.author}
        </div>
      </div>
    );
  }

  function Shelf({ label, list, statusKey }) {
    const isEmpty = list.length === 0;
    const isDropTarget = !!statusKey;
    const isHovered = isDropTarget && dragOverStatus === statusKey;
    if (isEmpty && !(dragBookId && isDropTarget)) return null;
    return (
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: isHovered ? STATUS[statusKey].color : "#8FD4CC",
            marginBottom: 14,
            paddingLeft: 2,
          }}
        >
          {label} · {list.length}권
        </div>
        <div
          data-shelf-status={isDropTarget ? statusKey : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))",
            columnGap: 8,
            rowGap: 22,
            gridAutoRows: 210,
            minHeight: isEmpty ? 90 : undefined,
            borderRadius: 10,
            outline: isHovered ? `2px dashed ${STATUS[statusKey].color}` : "none",
            outlineOffset: 4,
            transition: "outline 0.1s ease",
            background: isEmpty
              ? "transparent"
              : "repeating-linear-gradient(to bottom, transparent 0px, transparent 210px, #123B3A 210px, #1F5C58 214px, #123B3A 218px, transparent 222px, transparent 232px)",
            paddingBottom: 10,
          }}
        >
          {isEmpty && dragBookId && isDropTarget && (
            <div
              style={{
                gridColumn: "1 / -1",
                border: "1px dashed #1B5C58",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isHovered ? STATUS[statusKey].color : "#8FD4CC",
                fontSize: 12,
                height: 90,
              }}
            >
              여기에 놓아서 "{STATUS[statusKey].label}"로 옮기기
            </div>
          )}
          {list.map((b) => (
            <Spine key={b.id} book={b} />
          ))}
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", padding: 60, textAlign: "center", color: "#8FD4CC", fontFamily: "sans-serif", background: "linear-gradient(180deg, #0A4048 0%, #052226 55%, #031619 100%)" }}>
        서재를 여는 중...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0A4048 0%, #052226 55%, #031619 100%)",
        color: "#EAFBF8",
        fontFamily: "'Gothic A1', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Song+Myung&family=Gothic+A1:wght@400;500;700;900&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        input, textarea, select { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: #4A8C86; }
        .lib-input {
          width: 100%; background: #0F4750; border: 1px solid #1B5C58; color: #EAFBF8;
          border-radius: 8px; padding: 9px 12px; font-size: 14px; outline: none;
        }
        .lib-input:focus { border-color: #2DD4C7; }
        .lib-btn {
          background: #2DD4C7; color: #0F4750; border: none; border-radius: 8px;
          padding: 9px 16px; font-size: 14px; font-weight: 700; cursor: pointer;
        }
        .lib-btn:hover { background: #5FF5E4; }
        .lib-btn-ghost {
          background: transparent; color: #EAFBF8; border: 1px solid #1B5C58; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; cursor: pointer;
        }
        .lib-btn-ghost:hover { border-color: #2DD4C7; color: #2DD4C7; }
        .scrollpanel::-webkit-scrollbar { width: 8px; }
        .scrollpanel::-webkit-scrollbar-thumb { background: #1B5C58; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "44px 24px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#2DD4C7", fontSize: 12, letterSpacing: "0.18em", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              <Library size={14} /> PRIVATE COLLECTION
            </div>
            <h1 style={{ fontFamily: "'Gowun Batang', serif", fontSize: 40, margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>
              Book Track
            </h1>
            <p style={{ color: "#EAFBF8", fontSize: 14, marginTop: 6 }}>
              나의 소중한 책, 읽어온 흔적들 ...
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="lib-btn-ghost" onClick={openRecommend} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={15} /> AI 추천
            </button>
            <button className="lib-btn" onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} /> 책 추가
            </button>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 20, background: "#0F4750", border: "1px solid #1B5C58", borderRadius: 10, padding: "14px 20px", flex: "1 1 320px", boxShadow: "0 2px 10px rgba(58,42,33,0.06)" }}>
            {[
              ["책장", stats.total, "#FF5C4D"],
              ["읽는~중", stats.reading, "#FFB05C"],
              ["읽었~어", stats.done, "#2DD4C7"],
              ["읽고~파", stats.want, "#4A90D9"],
              ["추천해", stats.recommend, "#F5C84C"],
            ].map(([label, val, color], i) => (
              <div key={label} style={{ textAlign: "center", ...(i === 4 ? { marginLeft: "auto" } : {}) }}>
                <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* search/filter */}
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#8FD4CC" }} />
            <input
              className="lib-input"
              style={{ paddingLeft: 34 }}
              placeholder="제목 또는 저자로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "reading", "done", "want"].map((s) => {
              const activeColor = s === "all" ? "#2DD4C7" : STATUS[s].color;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="lib-btn-ghost"
                  style={{
                    borderColor: statusFilter === s ? activeColor : "#1B5C58",
                    color: statusFilter === s ? activeColor : "#EAFBF8",
                  }}
                >
                  {s === "all" ? "전체" : STATUS[s].label}
                </button>
              );
            })}
          </div>
          <select className="lib-input" style={{ width: 150 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="recent">최근 추가순</option>
            <option value="title">제목순</option>
            <option value="author">저자순</option>
            <option value="rating">별점순</option>
          </select>
        </div>
      </div>

      {/* shelves */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "10px 24px 80px" }}>
        {activeBooks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", border: "1px dashed #1B5C58", borderRadius: 12 }}>
            <BookOpen size={30} color="#8FD4CC" />
            <p style={{ fontFamily: "'Gowun Batang', serif", fontSize: 20, marginTop: 14 }}>
              {isReadOnly ? "이 서재에는 아직 책이 없어요" : "서재가 비어있어요"}
            </p>
            {!isReadOnly && (
              <>
                <p style={{ color: "#8FD4CC", fontSize: 13, marginTop: 6 }}>첫 번째 책을 꽂아 나만의 서재를 시작해 보세요.</p>
                <button className="lib-btn" onClick={openAdd} style={{ marginTop: 18 }}>책 추가</button>
              </>
            )}
          </div>
        ) : showFlat ? (
          filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#8FD4CC" }}>일치하는 책이 없어요.</div>
          ) : (
            <Shelf label="검색 결과" list={filtered} />
          )
        ) : (
          <>
            <Shelf label="전체" list={[...activeBooks].sort((a, b) => b.dateAdded - a.dateAdded)} />
            <Shelf label="읽는~중" statusKey="reading" list={activeBooks.filter((b) => b.status === "reading").sort((a, b) => b.dateAdded - a.dateAdded)} />
            <Shelf label="읽었~어" statusKey="done" list={activeBooks.filter((b) => b.status === "done").sort((a, b) => b.dateAdded - a.dateAdded)} />
            <Shelf label="읽고~파" statusKey="want" list={activeBooks.filter((b) => b.status === "want").sort((a, b) => b.dateAdded - a.dateAdded)} />
          </>
        )}
      </div>

      {/* Detail panel */}
      {selectedBook && (
        <>
          <div onClick={() => setSelectedId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40, animation: "fadeIn 0.2s ease" }} />
          <div
            className="scrollpanel"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)",
              background: "#0F4750", zIndex: 41, overflowY: "auto", animation: "slideIn 0.25s ease",
              borderLeft: "1px solid #1B5C58", padding: 26, boxShadow: "-8px 0 24px rgba(58,42,33,0.10)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
              <button className="lib-btn-ghost" onClick={() => copyToClipboard(selectedBook)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Copy size={13} /> 감상평 복사
              </button>
              {!isReadOnly && (
                <>
                  <button className="lib-btn-ghost" onClick={() => openEdit(selectedBook)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Pencil size={13} /> 수정
                  </button>
                  <button className="lib-btn-ghost" onClick={() => deleteBook(selectedBook.id)} style={{ display: "flex", alignItems: "center", gap: 5, color: "#FF6B5C" }}>
                    <Trash2 size={13} /> 삭제
                  </button>
                </>
              )}
              <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#8FD4CC", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <Cover book={selectedBook} width={104} height={148} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#062A2F", color: STATUS[selectedBook.status].color, border: `1px solid ${STATUS[selectedBook.status].color}55` }}>
                  {STATUS[selectedBook.status].label}
                </span>
                {selectedBook.recommend && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#F5C84C", color: "#141014", marginLeft: 6 }}>
                    추천해
                  </span>
                )}
                <h2 style={{ fontFamily: "'Gowun Batang', serif", fontSize: 22, margin: "8px 0 2px" }}>{selectedBook.title}</h2>
                <p style={{ color: "#8FD4CC", fontSize: 13.5, margin: 0 }}>{selectedBook.author}</p>
                {selectedBook.genre && (
                  <p style={{ color: "#4A8C86", fontSize: 12, marginTop: 6 }}>#{selectedBook.genre}</p>
                )}
                <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={18}
                      onClick={() => !isReadOnly && setRating(selectedBook.id, n === selectedBook.rating ? 0 : n)}
                      style={{ cursor: isReadOnly ? "default" : "pointer" }}
                      color="#2DD4C7"
                      fill={n <= selectedBook.rating ? "#2DD4C7" : "none"}
                    />
                  ))}
                </div>
                {selectedDays && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, color: "#8FD4CC" }}>
                    <Clock size={12} /> {selectedDays}일 만에 완독했어요
                  </div>
                )}
              </div>
            </div>

            {selectedBook.description && (
              <div style={{ marginTop: 22 }}>
                <SectionLabel>도서 소개</SectionLabel>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#B8E8E0" }}>{selectedBook.description}</p>
              </div>
            )}

            {selectedBook.authorBio && (
              <div style={{ marginTop: 22 }}>
                <SectionLabel>저자 소개</SectionLabel>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#B8E8E0" }}>{selectedBook.authorBio}</p>
              </div>
            )}

            {otherByAuthor.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <SectionLabel>이 작가의 다른 책</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {otherByAuthor.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => openDetail(b)}
                      style={{
                        display: "flex", alignItems: "center", gap: 7, background: "#062A2F",
                        border: "1px solid #1B5C58", borderRadius: 20, padding: "6px 12px 6px 6px", cursor: "pointer",
                      }}
                    >
                      <Cover book={b} width={24} height={32} />
                      <span style={{ fontSize: 12.5, color: "#EAFBF8" }}>{b.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 22 }}>
              <SectionLabel>감상평</SectionLabel>
              {selectedBook.review ? (
                <p style={{ fontSize: 13.5, lineHeight: 1.75, color: "#B8E8E0", whiteSpace: "pre-wrap" }}>{selectedBook.review}</p>
              ) : (
                <p style={{ fontSize: 13, color: "#4A8C86" }}>아직 작성한 감상평이 없어요. 수정에서 남겨보세요.</p>
              )}
            </div>

            <div style={{ marginTop: 22 }}>
              <SectionLabel>인상 깊은 문장</SectionLabel>
              {(selectedBook.quotes || []).map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#062A2F", border: "1px solid #1B5C58", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                  <Quote size={13} color="#2DD4C7" style={{ marginTop: 3, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#B8E8E0", margin: 0, flex: 1, fontStyle: "italic" }}>{q}</p>
                  {!isReadOnly && (
                    <button onClick={() => removeQuote(i)} style={{ background: "none", border: "none", color: "#4A8C86", cursor: "pointer" }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              {(!selectedBook.quotes || selectedBook.quotes.length === 0) && isReadOnly && (
                <p style={{ fontSize: 13, color: "#4A8C86" }}>기록된 문장이 없어요.</p>
              )}
              {!isReadOnly && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="lib-input"
                    placeholder="마음에 남는 문장을 적어보세요"
                    value={quoteInput}
                    onChange={(e) => setQuoteInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addQuote()}
                  />
                  <button className="lib-btn-ghost" onClick={addQuote}>추가</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add/Edit form */}
      {draft && (
        <>
          <div onClick={() => setDraft(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40, animation: "fadeIn 0.2s ease" }} />
          <div
            className="scrollpanel"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)",
              background: "#0F4750", zIndex: 41, overflowY: "auto", animation: "slideIn 0.25s ease",
              borderLeft: "1px solid #1B5C58", padding: 26, boxShadow: "-8px 0 24px rgba(58,42,33,0.10)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontFamily: "'Gowun Batang', serif", fontSize: 20, margin: 0 }}>
                {draft.id ? "책 정보 수정" : "새 책 추가"}
              </h3>
              <button onClick={() => setDraft(null)} style={{ background: "none", border: "none", color: "#8FD4CC", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <Field label="제목">
              <input className="lib-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="책 제목" />
            </Field>
            <Field label="저자">
              <input className="lib-input" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} placeholder="지은이" />
            </Field>
            <Field label="표지 사진">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleCoverFile}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {draft.cover ? (
                  <img src={draft.cover} alt="표지 미리보기" style={{ width: 52, height: 70, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 70, borderRadius: 6, background: "#0A2E2C", border: "1px dashed #1B5C58", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <button
                    type="button"
                    className="lib-btn-ghost"
                    onClick={() => coverInputRef.current && coverInputRef.current.click()}
                    disabled={coverRecognizing}
                    style={{ width: "100%" }}
                  >
                    {coverRecognizing ? "사진에서 정보 인식 중..." : "사진 업로드해서 자동 채우기"}
                  </button>
                  <input
                    className="lib-input"
                    style={{ marginTop: 8 }}
                    value={draft.cover.startsWith("data:") ? "" : draft.cover}
                    onChange={(e) => setDraft({ ...draft, cover: e.target.value })}
                    placeholder="또는 표지 이미지 URL 직접 입력"
                  />
                </div>
              </div>
              {coverRecognizing && (
                <p style={{ fontSize: 11.5, color: "#4A8C86", marginTop: 6, marginBottom: 0 }}>
                  사진을 보고 제목·저자·소개·장르를 자동으로 채우고 있어요. 잠시만요.
                </p>
              )}
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="장르 / 태그">
                  <input className="lib-input" value={draft.genre} onChange={(e) => setDraft({ ...draft, genre: e.target.value })} placeholder="소설, 에세이..." />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="읽기 상태">
                  <select className="lib-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAutofillText}
              disabled={textAutofilling}
              className="lib-btn-ghost"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 14 }}
            >
              <Sparkles size={14} /> {textAutofilling ? "채우는 중..." : "제목/저자로 저자·도서 소개 자동 채우기"}
            </button>
            <Field label="저자 소개">
              <textarea className="lib-input" rows={3} value={draft.authorBio} onChange={(e) => setDraft({ ...draft, authorBio: e.target.value })} placeholder="이 작가에 대한 간단한 소개" />
            </Field>
            <Field label="도서 소개">
              <textarea className="lib-input" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="이 책의 줄거리나 소개" />
            </Field>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "#8FD4CC" }}>감상평</div>
              <button
                type="button"
                onClick={handlePolishReview}
                disabled={reviewPolishing}
                style={{ background: "none", border: "none", color: "#2DD4C7", cursor: "pointer", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}
              >
                <Sparkles size={12} /> {reviewPolishing ? "다듬는 중..." : "AI로 다듬기"}
              </button>
            </div>
            <Field label="">
              <textarea className="lib-input" rows={4} value={draft.review} onChange={(e) => setDraft({ ...draft, review: e.target.value })} placeholder="이 책을 읽고 느낀 점을 자유롭게 적어보세요" style={{ marginTop: -6 }} />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="읽기 시작일">
                  <input type="date" className="lib-input" value={draft.dateStarted} onChange={(e) => setDraft({ ...draft, dateStarted: e.target.value })} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="완독일">
                  <input type="date" className="lib-input" value={draft.dateFinished} onChange={(e) => setDraft({ ...draft, dateFinished: e.target.value })} />
                </Field>
              </div>
            </div>
            {daysBetween(draft.dateStarted, draft.dateFinished) && (
              <p style={{ fontSize: 12, color: "#8FD4CC", marginTop: -8, marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
                <Clock size={12} /> {daysBetween(draft.dateStarted, draft.dateFinished)}일 만에 완독하게 돼요
              </p>
            )}
            <Field label="별점">
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={20}
                    onClick={() => setDraft({ ...draft, rating: n === draft.rating ? 0 : n })}
                    style={{ cursor: "pointer" }}
                    color="#2DD4C7"
                    fill={n <= draft.rating ? "#2DD4C7" : "none"}
                  />
                ))}
              </div>
            </Field>

            <Field label="이 책, 추천해?">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, recommend: !draft.recommend })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  background: draft.recommend ? "#F5C84C" : "transparent",
                  color: draft.recommend ? "#141014" : "#8FD4CC",
                  border: "1px solid #F5C84C",
                  borderRadius: 999,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {draft.recommend ? "✓ 네, 추천해요" : "아직 아니에요"}
              </button>
              <p style={{ fontSize: 11, color: "#8FD4CC", marginTop: 6, marginBottom: 0 }}>
                친구에게 추천하고 싶은 책만 골라서 "추천해" 목록에 모아둬요
              </p>
            </Field>

            <button className="lib-btn" style={{ width: "100%", marginTop: 10, padding: "11px 0" }} onClick={saveDraft}>
              {draft.id ? "수정 완료" : "서재에 꽂기"}
            </button>

            <button
              className="lib-btn-ghost"
              style={{ width: "100%", marginTop: 10, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              onClick={() => shareBook(draft)}
            >
              <Share2 size={14} /> 카카오톡 등으로 보내기
            </button>
          </div>
        </>
      )}

      {/* Recommend modal */}
      {recommendOpen && (
        <>
          <div onClick={() => setRecommendOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, animation: "fadeIn 0.2s ease" }} />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: "min(480px, 92vw)", maxHeight: "80vh", overflowY: "auto",
              background: "#0F4750", border: "1px solid #1B5C58",
              borderRadius: 14, zIndex: 51, padding: 24, animation: "fadeIn 0.2s ease",
              boxShadow: "0 12px 32px rgba(58,42,33,0.14)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Gowun Batang', serif", fontSize: 19, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={17} /> 다음 읽을 책 추천
              </h3>
              <button onClick={() => setRecommendOpen(false)} style={{ background: "none", border: "none", color: "#8FD4CC", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {recommendLoading && (
              <p style={{ fontSize: 13, color: "#8FD4CC", textAlign: "center", padding: "24px 0" }}>
                내 서재 취향을 분석해서 책을 고르는 중이에요...
              </p>
            )}

            {!recommendLoading && recommendError && (
              <p style={{ fontSize: 13, color: "#FF6B5C", lineHeight: 1.6 }}>{recommendError}</p>
            )}

            {!recommendLoading && !recommendError && recommendations.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recommendations.map((r, i) => (
                  <div key={i} style={{ background: "#062A2F", border: "1px solid #1B5C58", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontFamily: "'Gowun Batang', serif", fontSize: 16, color: "#EAFBF8" }}>{r.title}</div>
                    {r.author && <div style={{ fontSize: 12, color: "#8FD4CC", marginTop: 2 }}>{r.author}</div>}
                    {r.reason && <p style={{ fontSize: 12.5, color: "#B8E8E0", lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>{r.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {dragBookId && (() => {
        const draggedBook = activeBooks.find((b) => b.id === dragBookId);
        if (!draggedBook) return null;
        const c = spineColor(draggedBook.id);
        return (
          <div
            style={{
              position: "fixed",
              left: dragPos.x - 29,
              top: dragPos.y - 60,
              width: 58,
              height: 120,
              background: c.bg,
              borderRadius: "3px 3px 2px 2px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 2px #2DD4C7",
              zIndex: 80,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              opacity: 0.95,
              transform: "rotate(-3deg)",
            }}
          >
            <div
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                fontFamily: "'Song Myung', serif",
                fontWeight: 600,
                fontSize: 11.5,
                color: c.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxHeight: 106,
              }}
            >
              {draggedBook.title}
            </div>
          </div>
        );
      })()}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0F4750", border: "1px solid #2DD4C7", color: "#EAFBF8", padding: "10px 20px", borderRadius: 24, fontSize: 13, zIndex: 60, animation: "fadeIn 0.2s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Cover({ book, width, height }) {
  const c = spineColor(book.id);
  if (book.cover) {
    return (
      <img
        src={book.cover}
        alt={book.title}
        style={{ width, height, objectFit: "cover", borderRadius: 6, flexShrink: 0, boxShadow: "0 4px 14px rgba(58,42,33,0.18)" }}
        onError={(e) => { e.target.style.display = "none"; }}
      />
    );
  }
  return (
    <div
      style={{
        width, height, borderRadius: 6, flexShrink: 0, background: c.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Gowun Batang', serif", fontSize: width * 0.4, fontWeight: 700, color: c.text,
        boxShadow: "0 4px 14px rgba(58,42,33,0.18)",
      }}
    >
      {book.title.trim().charAt(0)}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: "#2DD4C7", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "#8FD4CC", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
