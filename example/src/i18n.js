// A real i18next setup: plurals go through Intl.PluralRules, like in production apps.
import i18next from 'i18next';

const resources = {
  en: {
    translation: {
      results_one: '{{count}} result',
      results_other: '{{count}} results',
      liked: '{{who}} liked your photo',
      commented: '{{who}} commented on your post',
      followed: '{{who}} started following you',
      likes_one: '{{count}} like',
      likes_other: '{{count}} likes',
      others_one: '{{count}} other',
      others_other: '{{count}} others',
    },
  },
  fr: {
    translation: {
      results_one: '{{count}} résultat',
      results_many: '{{count}} résultats',
      results_other: '{{count}} résultats',
      liked: "Nouveau j'aime de {{who}}",
      commented: 'Nouveau commentaire de {{who}}',
      followed: 'Nouvel abonnement : {{who}}',
      likes_one: "{{count}} j'aime",
      likes_many: "{{count}} j'aime",
      likes_other: "{{count}} j'aime",
      others_one: '{{count}} autre',
      others_many: '{{count}} autres',
      others_other: '{{count}} autres',
    },
  },
  pl: {
    translation: {
      results_one: '{{count}} wynik',
      results_few: '{{count}} wyniki',
      results_many: '{{count}} wyników',
      results_other: '{{count}} wyniku',
      liked: 'Polubienie od {{who}}',
      commented: 'Komentarz od {{who}}',
      followed: 'Nowy obserwujący: {{who}}',
      likes_one: '{{count}} polubienie',
      likes_few: '{{count}} polubienia',
      likes_many: '{{count}} polubień',
      likes_other: '{{count}} polubienia',
      others_one: '{{count}} inna osoba',
      others_few: '{{count}} inne osoby',
      others_many: '{{count}} innych osób',
      others_other: '{{count}} innej osoby',
    },
  },
  ar: {
    translation: {
      results_zero: 'لا نتائج',
      results_one: 'نتيجة واحدة',
      results_two: 'نتيجتان',
      results_few: '{{count}} نتائج',
      results_many: '{{count}} نتيجة',
      results_other: '{{count}} نتيجة',
      liked: 'إعجاب من {{who}}',
      commented: 'تعليق من {{who}}',
      followed: 'متابع جديد: {{who}}',
      likes_zero: 'لا إعجابات',
      likes_one: 'إعجاب واحد',
      likes_two: 'إعجابان',
      likes_few: '{{count}} إعجابات',
      likes_many: '{{count}} إعجابًا',
      likes_other: '{{count}} إعجاب',
      others_zero: 'لا أحد آخر',
      others_one: 'شخص آخر',
      others_two: 'شخصان آخران',
      others_few: '{{count}} أشخاص آخرين',
      others_many: '{{count}} شخصًا آخر',
      others_other: '{{count}} شخص آخر',
    },
  },
};

i18next.init({ lng: 'en', fallbackLng: 'en', resources, initAsync: false, interpolation: { escapeValue: false } });

export const LANGUAGES = ['en', 'fr', 'pl', 'ar'];
export default i18next;
