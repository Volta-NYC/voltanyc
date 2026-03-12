"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/Icons";
import { validateContactForm, type ContactFormValues } from "@/lib/schemas";

type Lang = "en" | "es" | "zh" | "ko" | "ar" | "fr";

const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  zh: "中文",
  ko: "한국어",
  ar: "العربية",
  fr: "Français",
};
const LANG_ORDER: Lang[] = ["en", "es", "fr", "zh", "ko", "ar"];

const SERVICES_BY_LANG: Record<Lang, string[]> = {
  en: ["Website Design & Development", "Social Media & Content", "Grant Research & Writing", "SEO & Google Maps Visibility", "Sales & Financial Analysis", "Digital Payment Setup", "Other"],
  es: ["Diseño y desarrollo web", "Redes sociales y contenido", "Investigación y redacción de becas", "SEO y visibilidad en Google Maps", "Análisis de ventas y finanzas", "Configuración de pagos digitales", "Otro"],
  zh: ["网站设计与开发", "社交媒体与内容", "助款研究与撰写", "SEO与谷歌地图优化", "销售与财务分析", "数字支付设置", "其他"],
  ko: ["웹사이트 디자인 및 개발", "소셜 미디어 및 콘텐츠", "보조금 연구 및 작성", "SEO 및 구글 지도 가시성", "매출 및 재무 분석", "디지털 결제 설정", "기타"],
  ar: ["تصميم وتطوير المواقع", "وسائل التواصل الاجتماعي والمحتوى", "البحث عن المنح وكتابتها", "تحسين محركات البحث وخرائط جوجل", "تحليل المبيعات والمالية", "إعداد الدفع الرقمي", "أخرى"],
  fr: ["Conception et développement web", "Médias sociaux et contenu", "Recherche et rédaction de subventions", "Référencement et visibilité Google Maps", "Analyse des ventes et finances", "Mise en place de paiement numérique", "Autre"],
};

const COPY: Record<Lang, {
  businessName: string; ownerName: string; email: string; neighborhood: string;
  services: string; message: string; messagePlaceholder: string; submit: string;
  submitting: string; successTitle: string; successBody: string; errorMsg: string;
  footerNote: string; dir: "ltr" | "rtl";
}> = {
  en: { businessName: "Business Name *", ownerName: "Your Name *", email: "Email *", neighborhood: "Neighborhood", services: "What do you need help with?", message: "Tell us more", messagePlaceholder: "What's your biggest challenge right now?", submit: "Send Message", submitting: "Sending…", successTitle: "Got it. We'll be in touch.", successBody: "We'll review your submission and reach out within a few days.", errorMsg: "Something went wrong. Email us at info@voltanyc.org", footerNote: "We typically respond within 2–3 business days. Our services are 100% free.", dir: "ltr" },
  es: { businessName: "Nombre del negocio *", ownerName: "Su nombre *", email: "Correo electrónico *", neighborhood: "Vecindario", services: "¿Con qué necesita ayuda?", message: "Cuéntenos más", messagePlaceholder: "¿Cuál es su mayor desafío ahora mismo?", submit: "Enviar mensaje", submitting: "Enviando…", successTitle: "Recibido. Nos pondremos en contacto.", successBody: "Revisaremos su solicitud y le responderemos en pocos días.", errorMsg: "Algo salió mal. Escríbanos a info@voltanyc.org", footerNote: "Generalmente respondemos en 2–3 días hábiles. Nuestros servicios son 100% gratuitos.", dir: "ltr" },
  zh: { businessName: "商户名称 *", ownerName: "您的姓名 *", email: "电子邮件 *", neighborhood: "所在社区", services: "您需要哪方面的帮助？", message: "请告诉我们更多", messagePlaceholder: "您目前面临的最大挑战是什么？", submit: "发送消息", submitting: "发送中…", successTitle: "已收到。我们会尽快联系您。", successBody: "我们将审核您的提交，并在几天内回复您。", errorMsg: "出现错误。请发送邮件至 info@voltanyc.org", footerNote: "我们通常在 2–3 个工作日内回复。我们的服务完全免费。", dir: "ltr" },
  ko: { businessName: "사업체명 *", ownerName: "성함 *", email: "이메일 *", neighborhood: "동네", services: "어떤 도움이 필요하신가요?", message: "더 알려주세요", messagePlaceholder: "현재 가장 어려운 점은 무엇인가요?", submit: "메시지 보내기", submitting: "전송 중…", successTitle: "접수되었습니다. 곧 연락드리겠습니다.", successBody: "제출하신 내용을 검토하고 며칠 내에 연락드리겠습니다.", errorMsg: "오류가 발생했습니다. info@voltanyc.org 으로 이메일 보내주세요.", footerNote: "보통 2–3 영업일 이내에 답변드립니다. 모든 서비스는 무료입니다.", dir: "ltr" },
  ar: { businessName: "اسم النشاط التجاري *", ownerName: "اسمك *", email: "البريد الإلكتروني *", neighborhood: "الحي", services: "ما الذي تحتاج إلى مساعدة فيه؟", message: "أخبرنا المزيد", messagePlaceholder: "ما هو أكبر تحديك الآن؟", submit: "إرسال الرسالة", submitting: "جارٍ الإرسال…", successTitle: "تم الاستلام. سنتواصل معك قريبًا.", successBody: "سنراجع طلبك ونتواصل معك خلال أيام قليلة.", errorMsg: "حدث خطأ ما. راسلنا على info@voltanyc.org", footerNote: "نرد عادةً خلال 2–3 أيام عمل. خدماتنا مجانية 100%.", dir: "rtl" },
  fr: { businessName: "Nom de l'entreprise *", ownerName: "Votre nom *", email: "E-mail *", neighborhood: "Quartier", services: "De quoi avez-vous besoin ?", message: "Dites-nous en plus", messagePlaceholder: "Quel est votre plus grand défi en ce moment ?", submit: "Envoyer le message", submitting: "Envoi en cours…", successTitle: "Reçu. Nous vous recontacterons.", successBody: "Nous examinerons votre demande et reviendrons vers vous dans quelques jours.", errorMsg: "Une erreur s'est produite. Écrivez-nous à info@voltanyc.org", footerNote: "Nous répondons généralement sous 2–3 jours ouvrés. Nos services sont 100% gratuits.", dir: "ltr" },
};

const EMPTY: ContactFormValues = {
  businessName: "", name: "", email: "", neighborhood: "", services: [], message: "",
};

export default function ContactForm() {
  const [lang, setLang] = useState<Lang>("en");
  const [formData, setFormData] = useState<ContactFormValues>(EMPTY);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const c = COPY[lang];
  const serviceList = SERVICES_BY_LANG[lang];

  const toggleService = (s: string) =>
    setFormData((prev) => ({
      ...prev,
      services: prev.services.includes(s)
        ? prev.services.filter((x) => x !== s)
        : [...prev.services, s],
    }));

  const clearError = (k: string) =>
    setErrors((p) => { const next = { ...p }; delete next[k]; return next; });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateContactForm(formData);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setStatus("loading");

    // Translate selected services back to English using the array index,
    // regardless of which language the user submitted the form in.
    const englishServices = formData.services.map((s) => {
      const idx = serviceList.indexOf(s);
      return idx >= 0 ? SERVICES_BY_LANG["en"][idx] : s;
    }).join(", ");

    // Send via server-side proxy to avoid CORS issues with Apps Script.
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType:     "contact",
          businessName: formData.businessName,
          name:         formData.name,
          email:        formData.email,
          neighborhood: formData.neighborhood,
          services:     englishServices,
          message:      formData.message,
          language:     LANG_LABELS[lang],
        }),
      });
      if (!res.ok) throw new Error("submit_failed");
      setStatus("success");
      setFormData(EMPTY);
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="bg-white border border-v-border rounded-2xl p-10 text-center" dir={c.dir}>
        <div className="w-14 h-14 rounded-full bg-v-green/20 flex items-center justify-center mx-auto mb-4">
          <CheckIcon className="w-7 h-7 text-v-green" />
        </div>
        <h3 className="font-display font-bold text-2xl text-v-ink mb-3">{c.successTitle}</h3>
        <p className="font-body text-v-muted">{c.successBody}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Language toggle */}
      <div className="flex flex-wrap gap-2 mb-6">
        {LANG_ORDER.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              setLang(l);
              setFormData((p) => ({ ...p, services: [] }));
              setErrors({});
            }}
            className={`px-4 py-1.5 rounded-full border font-body text-sm font-medium transition-all ${lang === l ? "bg-v-ink text-white border-v-ink" : "bg-white border-v-border text-v-muted hover:border-v-ink"}`}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white border border-v-border rounded-2xl p-8 md:p-10 space-y-5" dir={c.dir}>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block font-body text-sm font-semibold text-v-ink mb-2">{c.businessName}</label>
            <input
              value={formData.businessName}
              onChange={(e) => { setFormData((p) => ({ ...p, businessName: e.target.value })); clearError("businessName"); }}
              className={`volta-input ${errors.businessName ? "border-red-400" : ""}`}
            />
            {errors.businessName && <p className="text-red-500 text-xs mt-1 font-body">{errors.businessName}</p>}
          </div>
          <div>
            <label className="block font-body text-sm font-semibold text-v-ink mb-2">{c.ownerName}</label>
            <input
              value={formData.name}
              onChange={(e) => { setFormData((p) => ({ ...p, name: e.target.value })); clearError("name"); }}
              className={`volta-input ${errors.name ? "border-red-400" : ""}`}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1 font-body">{errors.name}</p>}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block font-body text-sm font-semibold text-v-ink mb-2">{c.email}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => { setFormData((p) => ({ ...p, email: e.target.value })); clearError("email"); }}
              className={`volta-input ${errors.email ? "border-red-400" : ""}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1 font-body">{errors.email}</p>}
          </div>
          <div>
            <label className="block font-body text-sm font-semibold text-v-ink mb-2">{c.neighborhood}</label>
            <input
              value={formData.neighborhood}
              onChange={(e) => setFormData((p) => ({ ...p, neighborhood: e.target.value }))}
              className="volta-input"
            />
          </div>
        </div>
        <div>
          <label className="block font-body text-sm font-semibold text-v-ink mb-3">{c.services}</label>
          <div className="flex flex-wrap gap-2">
            {serviceList.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleService(s)}
                className={`text-sm font-body font-medium px-4 py-2 rounded-full border transition-all ${formData.services.includes(s) ? "bg-v-green border-v-green text-v-ink" : "bg-white border-v-border text-v-muted hover:border-v-ink"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block font-body text-sm font-semibold text-v-ink mb-2">{c.message}</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
            className="volta-input resize-none"
            rows={4}
            placeholder={c.messagePlaceholder}
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-v-blue text-white font-display font-bold text-base py-4 rounded-xl hover:bg-v-blue-dark transition-colors disabled:opacity-60"
        >
          {status === "loading" ? c.submitting : c.submit}
        </button>
        {status === "error" && <p className="text-red-500 text-sm text-center font-body">{c.errorMsg}</p>}
        <p className="text-xs text-v-muted text-center font-body">{c.footerNote}</p>
      </form>
    </div>
  );
}
