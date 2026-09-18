// Claude 아티팩트의 window.storage API와 동일한 모양의 인터페이스를
// 브라우저 localStorage로 구현한 shim입니다.
// (Netlify 등 일반 웹 호스팅에서는 Claude의 storage 백엔드를 쓸 수 없어서,
//  기기별로 남는 localStorage로 대체합니다. shared 저장은 지원하지 않습니다.)

const PREFIX = "booktrack:";

function keyFor(key) {
  return PREFIX + key;
}

export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(keyFor(key));
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(keyFor(key), value);
      return { key, value, shared: false };
    } catch (e) {
      // 저장 용량 초과 등으로 실패할 수 있음 (예: 너무 큰 이미지)
      return null;
    }
  },

  async delete(key) {
    try {
      const existed = localStorage.getItem(keyFor(key)) !== null;
      localStorage.removeItem(keyFor(key));
      return { key, deleted: existed, shared: false };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) {
          keys.push(k.slice(PREFIX.length));
        }
      }
      return { keys, prefix, shared: false };
    } catch (e) {
      return { keys: [], prefix, shared: false };
    }
  },
};
