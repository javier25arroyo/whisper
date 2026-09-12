/** Frase de la hoja de emergencia. `name` es el nombre accesible (lo que se dice
 * en voz alta con Control por voz de iOS): corto, sin emojis ni dígitos, distinto
 * entre frases. `es` es el texto secundario para quien lleva el teléfono. `ja`
 * se muestra en grande y es lo que reproduce speechSynthesis en ja-JP. */
export interface EmergencyPhrase {
  id: string;
  name: string;
  es: string;
  ja: string;
}

export interface EmergencyNumber {
  number: string;
  es: string;
  ja: string;
}

/** Bloque fijo no interactivo en la cabecera de la lista: sirve tanto para marcar
 * como para señalar el número a un transeúnte junto a su nombre en japonés. */
export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { number: "119", es: "Ambulancia y bomberos", ja: "救急車・消防" },
  { number: "110", es: "Policía", ja: "警察" },
];

/** Se lee una vez al abrir la hoja: da contexto a quien escuche antes de la
 * primera frase (idioma, condición) sin que el usuario tenga que pulsar nada. */
export const EMERGENCY_CONTEXT: EmergencyPhrase = {
  id: "contexto",
  name: "Mi situación",
  es: "No hablo japonés, hablo español. No puedo mover bien las manos ni los pies.",
  ja: "日本語が話せません。スペイン語です。手も足も不自由です。",
};

export const EMERGENCY_PHRASES: EmergencyPhrase[] = [
  { id: "atencion", name: "Atención", es: "Disculpe", ja: "すみません。" },
  {
    id: "no-estoy-bien",
    name: "No estoy bien",
    es: "No estoy bien, ayúdeme",
    ja: "大丈夫じゃありません。助けてください。",
  },
  {
    id: "ambulancia",
    name: "Ambulancia",
    es: "Llamen a una ambulancia, es urgente",
    ja: "助けてください！救急車を呼んでください。119番です。",
  },
  {
    id: "policia",
    name: "Policía",
    es: "Llamen a la policía",
    ja: "警察を呼んでください。110番です。",
  },
  {
    id: "no-tire-fuerte",
    name: "No tire fuerte",
    es: "No me jale los brazos ni las piernas, avise antes de levantarme",
    ja: "腕や足を引っぱらないでください。持ち上げるときは声をかけてください。",
  },
  {
    id: "manos-y-pies",
    name: "Manos y pies",
    es: "No puedo mover bien las manos ni los pies, no puedo moverme solo",
    ja: "手も足も不自由です。一人では動けません。",
  },
  {
    id: "mi-telefono",
    name: "Mi teléfono",
    es: "Se me cayó el teléfono, recójalo y acérquelo a mi boca",
    ja: "スマホを拾って、口の近くに持ってください。",
  },
  { id: "me-duele", name: "Me duele", es: "Me duele, deténgase", ja: "痛いです。やめてください。" },
  {
    id: "silla-de-ruedas",
    name: "Silla de ruedas",
    es: "Necesito una silla de ruedas prestada",
    ja: "車いすを貸してください。",
  },
  {
    id: "empuje-mi-silla",
    name: "Empuje mi silla",
    es: "Empuje mi silla de ruedas, por favor",
    ja: "車いすを押していただけますか。",
  },
  {
    id: "ascensor",
    name: "Ascensor",
    es: "¿Dónde está el ascensor? Lléveme, por favor",
    ja: "エレベーターはどこですか。そこまで連れていってください。",
  },
  {
    id: "no-subo-escaleras",
    name: "No subo escaleras",
    es: "No puedo usar las escaleras",
    ja: "階段は使えません。",
  },
  {
    id: "saque-mi-medicina",
    name: "Saque mi medicina",
    es: "No puedo sacarla yo, abra mi bolso y saque la medicina de adentro",
    ja: "自分では取れません。かばんを開けて、中の薬を出してください。",
  },
  {
    id: "no-hablo-japones",
    name: "No hablo japonés",
    es: "No hablo japonés, hablo español",
    ja: "日本語が話せません。スペイン語を話します。",
  },
  {
    id: "agua-con-pajita",
    name: "Agua con pajita",
    es: "Deme agua, con pajita por favor",
    ja: "お水をください。ストローもお願いします。",
  },
  {
    id: "bano-accesible",
    name: "Baño accesible",
    es: "¿Dónde hay un baño accesible? Lléveme, por favor",
    ja: "車いすで使えるトイレはどこですか。連れていってください。",
  },
];
