import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type AppLanguage = "es" | "en" | "fr" | "de" | "pt" | "it" | "zh" | "ja" | "ko" | "ru" | "ar" | "hi";
export type LanguagePreference = "auto" | AppLanguage;

type Preferences = {
  theme: ThemePreference;
  language: LanguagePreference;
  resolvedLanguage: AppLanguage;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  t: (spanish: string, english: string) => string;
};

const STORAGE_KEY = "novaai-code:preferences";
const PreferencesContext = createContext<Preferences | null>(null);

const supportedLanguages: AppLanguage[] = ["es", "en", "fr", "de", "pt", "it", "zh", "ja", "ko", "ru", "ar", "hi"];

const translations: Partial<Record<AppLanguage, Record<string, string>>> = {
  fr: { Settings: "Paramètres", "Appearance and language": "Apparence et langue", Close: "Fermer", System: "Système", "Follows Windows": "Suit Windows", Light: "Clair", Dark: "Sombre", Automatic: "Automatique", "Windows language": "Langue de Windows", Appearance: "Apparence", Language: "Langue", "Search languages…": "Rechercher une langue…", "No languages found.": "Aucune langue trouvée.", "Configure providers": "Configurer les fournisseurs", Done: "Terminé", Files: "Fichiers", "File explorer": "Explorateur de fichiers", "AI chat": "Chat IA", Saved: "Enregistré", "Open a project": "Ouvrir un projet", "Open folder": "Ouvrir un dossier", Stop: "Arrêter", Send: "Envoyer", Copy: "Copier", Copied: "Copié", "Copy code": "Copier le code" },
  de: { Settings: "Einstellungen", "Appearance and language": "Darstellung und Sprache", Close: "Schließen", System: "System", "Follows Windows": "Folgt Windows", Light: "Hell", Dark: "Dunkel", Automatic: "Automatisch", "Windows language": "Windows-Sprache", Appearance: "Darstellung", Language: "Sprache", "Search languages…": "Sprachen suchen…", "No languages found.": "Keine Sprache gefunden.", "Configure providers": "Anbieter konfigurieren", Done: "Fertig", Files: "Dateien", "File explorer": "Datei-Explorer", "AI chat": "KI-Chat", Saved: "Gespeichert", "Open a project": "Projekt öffnen", "Open folder": "Ordner öffnen", Stop: "Stoppen", Send: "Senden", Copy: "Kopieren", Copied: "Kopiert", "Copy code": "Code kopieren" },
  pt: { Settings: "Configurações", "Appearance and language": "Aparência e idioma", Close: "Fechar", System: "Sistema", "Follows Windows": "Segue o Windows", Light: "Claro", Dark: "Escuro", Automatic: "Automático", "Windows language": "Idioma do Windows", Appearance: "Aparência", Language: "Idioma", "Search languages…": "Buscar idiomas…", "No languages found.": "Nenhum idioma encontrado.", "Configure providers": "Configurar provedores", Done: "Concluído", Files: "Arquivos", "File explorer": "Explorador de arquivos", "AI chat": "Chat com IA", Saved: "Salvo", "Open a project": "Abrir um projeto", "Open folder": "Abrir pasta", Stop: "Parar", Send: "Enviar", Copy: "Copiar", Copied: "Copiado", "Copy code": "Copiar código" },
  it: { Settings: "Impostazioni", "Appearance and language": "Aspetto e lingua", Close: "Chiudi", System: "Sistema", "Follows Windows": "Segue Windows", Light: "Chiaro", Dark: "Scuro", Automatic: "Automatico", "Windows language": "Lingua di Windows", Appearance: "Aspetto", Language: "Lingua", "Search languages…": "Cerca lingue…", "No languages found.": "Nessuna lingua trovata.", "Configure providers": "Configura provider", Done: "Fatto", Files: "File", "File explorer": "Esplora file", "AI chat": "Chat IA", Saved: "Salvato", "Open a project": "Apri un progetto", "Open folder": "Apri cartella", Stop: "Interrompi", Send: "Invia", Copy: "Copia", Copied: "Copiato", "Copy code": "Copia codice" },
  zh: { Settings: "设置", "Appearance and language": "外观和语言", Close: "关闭", System: "跟随系统", "Follows Windows": "跟随 Windows", Light: "浅色", Dark: "深色", Automatic: "自动", "Windows language": "Windows 语言", Appearance: "外观", Language: "语言", "Search languages…": "搜索语言…", "No languages found.": "未找到语言。", "Configure providers": "配置提供商", Done: "完成", Files: "文件", "File explorer": "文件资源管理器", "AI chat": "AI 聊天", Saved: "已保存", "Open a project": "打开项目", "Open folder": "打开文件夹", Stop: "停止", Send: "发送", Copy: "复制", Copied: "已复制", "Copy code": "复制代码" },
  ja: { Settings: "設定", "Appearance and language": "外観と言語", Close: "閉じる", System: "システム", "Follows Windows": "Windows に従う", Light: "ライト", Dark: "ダーク", Automatic: "自動", "Windows language": "Windows の言語", Appearance: "外観", Language: "言語", "Search languages…": "言語を検索…", "No languages found.": "言語が見つかりません。", "Configure providers": "プロバイダーを設定", Done: "完了", Files: "ファイル", "File explorer": "ファイルエクスプローラー", "AI chat": "AI チャット", Saved: "保存済み", "Open a project": "プロジェクトを開く", "Open folder": "フォルダーを開く", Stop: "停止", Send: "送信", Copy: "コピー", Copied: "コピー済み", "Copy code": "コードをコピー" },
  ko: { Settings: "설정", "Appearance and language": "모양 및 언어", Close: "닫기", System: "시스템", "Follows Windows": "Windows 설정 따름", Light: "라이트", Dark: "다크", Automatic: "자동", "Windows language": "Windows 언어", Appearance: "모양", Language: "언어", "Search languages…": "언어 검색…", "No languages found.": "언어를 찾을 수 없습니다.", "Configure providers": "공급자 설정", Done: "완료", Files: "파일", "File explorer": "파일 탐색기", "AI chat": "AI 채팅", Saved: "저장됨", "Open a project": "프로젝트 열기", "Open folder": "폴더 열기", Stop: "중지", Send: "보내기", Copy: "복사", Copied: "복사됨", "Copy code": "코드 복사" },
  ru: { Settings: "Настройки", "Appearance and language": "Оформление и язык", Close: "Закрыть", System: "Система", "Follows Windows": "Как в Windows", Light: "Светлая", Dark: "Тёмная", Automatic: "Автоматически", "Windows language": "Язык Windows", Appearance: "Оформление", Language: "Язык", "Search languages…": "Поиск языка…", "No languages found.": "Язык не найден.", "Configure providers": "Настроить провайдеров", Done: "Готово", Files: "Файлы", "File explorer": "Проводник файлов", "AI chat": "Чат с ИИ", Saved: "Сохранено", "Open a project": "Открыть проект", "Open folder": "Открыть папку", Stop: "Остановить", Send: "Отправить", Copy: "Копировать", Copied: "Скопировано", "Copy code": "Копировать код" },
  ar: { Settings: "الإعدادات", "Appearance and language": "المظهر واللغة", Close: "إغلاق", System: "النظام", "Follows Windows": "يتبع Windows", Light: "فاتح", Dark: "داكن", Automatic: "تلقائي", "Windows language": "لغة Windows", Appearance: "المظهر", Language: "اللغة", "Search languages…": "البحث عن لغة…", "No languages found.": "لم يتم العثور على لغة.", "Configure providers": "إعداد المزوّدين", Done: "تم", Files: "الملفات", "File explorer": "مستكشف الملفات", "AI chat": "محادثة الذكاء الاصطناعي", Saved: "تم الحفظ", "Open a project": "فتح مشروع", "Open folder": "فتح مجلد", Stop: "إيقاف", Send: "إرسال", Copy: "نسخ", Copied: "تم النسخ", "Copy code": "نسخ الكود" },
  hi: { Settings: "सेटिंग्स", "Appearance and language": "दिखावट और भाषा", Close: "बंद करें", System: "सिस्टम", "Follows Windows": "Windows के अनुसार", Light: "हल्का", Dark: "गहरा", Automatic: "स्वचालित", "Windows language": "Windows की भाषा", Appearance: "दिखावट", Language: "भाषा", "Search languages…": "भाषा खोजें…", "No languages found.": "कोई भाषा नहीं मिली।", "Configure providers": "प्रोवाइडर कॉन्फ़िगर करें", Done: "पूर्ण", Files: "फ़ाइलें", "File explorer": "फ़ाइल एक्सप्लोरर", "AI chat": "AI चैट", Saved: "सहेजा गया", "Open a project": "प्रोजेक्ट खोलें", "Open folder": "फ़ोल्डर खोलें", Stop: "रोकें", Send: "भेजें", Copy: "कॉपी", Copied: "कॉपी किया गया", "Copy code": "कोड कॉपी करें" },
};

function systemLanguage(): AppLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const base = language.toLocaleLowerCase().split("-")[0] as AppLanguage;
    if (supportedLanguages.includes(base)) return base;
  }
  return "en";
}

function loadPreferences(): { theme: ThemePreference; language: LanguagePreference } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<{ theme: ThemePreference; language: LanguagePreference }>;
    return {
      theme: ["system", "light", "dark"].includes(value.theme ?? "") ? value.theme! : "system",
      language: ["auto", ...supportedLanguages].includes(value.language as AppLanguage) ? value.language! : "auto",
    };
  } catch {
    return { theme: "system", language: "auto" };
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const resolvedLanguage = preferences.language === "auto" ? systemLanguage() : preferences.language;
  const resolvedTheme = preferences.theme === "system" ? (systemDark ? "dark" : "light") : preferences.theme;

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = resolvedLanguage;
    document.documentElement.dir = resolvedLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [preferences, resolvedLanguage, resolvedTheme]);

  const value = useMemo<Preferences>(() => ({
    ...preferences,
    resolvedLanguage,
    setTheme: (theme) => setPreferences((current) => ({ ...current, theme })),
    setLanguage: (language) => setPreferences((current) => ({ ...current, language })),
    t: (spanish, english) => resolvedLanguage === "es" ? spanish : translations[resolvedLanguage]?.[english] ?? english,
  }), [preferences, resolvedLanguage]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("PreferencesProvider is missing");
  return value;
}
