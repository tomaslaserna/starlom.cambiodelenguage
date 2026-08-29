export type CleaningProtocol = {
  category: string;
  suitableFor: string[];
  avoidOn: string[];
  procedure: string[];
  catalogTerms: string[];
  warnings: string[];
};

const UNIVERSAL_WARNINGS = [
  "Nunca mezclar lavandina/hipoclorito con ácidos, amoníaco, alcohol ni otros limpiadores.",
  "Leer etiqueta y ficha de seguridad, usar ventilación y el elemento de protección indicado por el fabricante.",
  "Probar primero en un sector pequeño y poco visible.",
  "No recomendar una dilución distinta de la etiqueta del producto.",
];

const PROTOCOLS: Array<CleaningProtocol & { keywords: string[] }> = [
  {
    category: "grasa y aceite",
    keywords: ["grasa", "aceite", "cocina", "campana", "desengrasar"],
    suitableFor: ["acero inoxidable", "cerámica", "superficies lavables resistentes"],
    avoidOn: ["aluminio sin protección", "madera sin sellar", "superficies pintadas sensibles"],
    procedure: ["Retirar el excedente sin extenderlo.", "Aplicar un desengrasante compatible según etiqueta.", "Respetar el tiempo de contacto sin dejar secar.", "Frotar suavemente, enjuagar y secar."],
    catalogTerms: ["desengrasante", "detergente", "sb5", "sb7"],
    warnings: ["En superficies calientes, esperar a que se enfríen antes de aplicar químicos."],
  },
  {
    category: "sarro y depósitos minerales",
    keywords: ["sarro", "calcareo", "calcareo", "mineral", "griferia", "inodoro"],
    suitableFor: ["cerámica sanitaria", "vidrio compatible", "grifería resistente a ácidos suaves"],
    avoidOn: ["mármol", "travertino", "piedra calcárea", "cemento", "metales sensibles"],
    procedure: ["Retirar suciedad superficial.", "Aplicar desincrustante o quitasarro compatible.", "Respetar el tiempo de contacto indicado.", "Enjuagar abundantemente y secar."],
    catalogTerms: ["quita sarro", "quitasarro", "desincrustante", "limpiador baño"],
    warnings: ["Los ácidos atacan piedra natural calcárea; confirmar el material antes de recomendar."],
  },
  {
    category: "moho y hongos",
    keywords: ["moho", "hongo", "hongos", "junta", "humedad"],
    suitableFor: ["azulejos", "juntas minerales", "superficies lavables compatibles"],
    avoidOn: ["textiles de color", "madera", "superficies incompatibles con oxidantes"],
    procedure: ["Corregir primero la fuente de humedad y ventilar.", "Limpiar la materia superficial sin dispersarla.", "Aplicar un producto autorizado para hongos según etiqueta.", "Respetar contacto, enjuagar si corresponde y secar completamente."],
    catalogTerms: ["lavandina", "hipoclorito", "antihongo", "fungicida"],
    warnings: ["Para áreas extensas, olores intensos o síntomas respiratorios, suspender y derivar a un profesional."],
  },
  {
    category: "sangre y fluidos biológicos",
    keywords: ["sangre", "vomito", "orina", "fluido", "biologico"],
    suitableFor: ["superficies duras no porosas compatibles"],
    avoidOn: ["materiales porosos sin protocolo específico", "superficies incompatibles con el desinfectante"],
    procedure: ["Aislar el área y usar guantes adecuados.", "Retirar el material con absorbente descartable.", "Limpiar antes de desinfectar.", "Aplicar un desinfectante autorizado con concentración y tiempo de contacto de etiqueta.", "Desechar y lavarse las manos según el protocolo institucional."],
    catalogTerms: ["desinfectante", "lavandina", "hipoclorito", "guante", "absorbente"],
    warnings: ["En instituciones seguir el protocolo de bioseguridad propio; no improvisar concentraciones."],
  },
  {
    category: "tinta, marcador o adhesivo",
    keywords: ["tinta", "marcador", "fibron", "adhesivo", "pegamento", "chicle"],
    suitableFor: ["vidrio", "metal", "superficie lavable compatible con solvente"],
    avoidOn: ["acrílico", "laca", "pintura", "plástico sensible", "textil delicado"],
    procedure: ["Retirar el excedente sin raspar la superficie.", "Probar un removedor compatible en zona oculta.", "Trabajar desde el borde hacia el centro.", "Retirar residuo, lavar y secar."],
    catalogTerms: ["removedor", "alcohol", "limpiavidrios", "raspin"],
    warnings: ["No usar solventes cerca de llama o calor; confirmar compatibilidad del material."],
  },
  {
    category: "suciedad general de pisos",
    keywords: ["piso", "porcelanato", "ceramica", "flotante", "madera", "mopa"],
    suitableFor: ["pisos según el producto específico y las indicaciones del fabricante"],
    avoidOn: ["madera o piso flotante con exceso de agua", "piedra sensible a ácidos"],
    procedure: ["Retirar polvo y partículas en seco.", "Elegir limpiador compatible con el tipo exacto de piso.", "Usar la mínima humedad necesaria.", "Fregar sin abrasivos agresivos y dejar secar."],
    catalogTerms: ["limpiador pisos", "desodorante pisos", "mopa", "microfibra", "ceramicol"],
    warnings: ["Preguntar siempre si es cerámica, porcelanato, madera, flotante o piedra natural."],
  },
  {
    category: "vidrios y espejos",
    keywords: ["vidrio", "espejo", "ventana", "vitrina"],
    suitableFor: ["vidrio", "espejo en buen estado"],
    avoidOn: ["pantallas", "vidrios con película o tratamiento sin confirmar"],
    procedure: ["Retirar polvo suelto.", "Aplicar poca cantidad sobre paño o superficie según etiqueta.", "Trabajar con microfibra limpia o vellón.", "Secar con secador/limpiavidrios sin dejar residuo."],
    catalogTerms: ["limpiavidrios", "microfibra", "vellon", "secador vidrio", "raspin"],
    warnings: ["No usar raspín sin confirmar que el vidrio no tenga lámina o tratamiento superficial."],
  },
  {
    category: "limpieza y desinfección general",
    keywords: ["limpiar", "desinfectar", "hogar", "oficina", "institucional", "baño"],
    suitableFor: ["superficies lavables compatibles"],
    avoidOn: ["superficies o alimentos no contemplados por la etiqueta"],
    procedure: ["Retirar residuos y suciedad visible.", "Limpiar con detergente o limpiador compatible.", "Enjuagar si la etiqueta lo requiere.", "Si hace falta desinfectar, aplicar un producto autorizado y respetar concentración y tiempo de contacto."],
    catalogTerms: ["detergente", "limpiador", "desinfectante", "microfibra"],
    warnings: ["Limpiar y desinfectar son etapas diferentes; más producto no implica mejor resultado."],
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function diagnoseCleaningProblem(problem: string, surface?: string, environment?: string) {
  const text = normalize([problem, surface, environment].filter(Boolean).join(" "));
  const ranked = PROTOCOLS.map((protocol) => ({
    protocol,
    score: protocol.keywords.reduce((score, keyword) => score + (text.includes(normalize(keyword)) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const selected = ranked[0]?.score ? ranked[0].protocol : PROTOCOLS[PROTOCOLS.length - 1];
  const needsSurface = !surface?.trim();
  return {
    category: selected.category,
    confidence: ranked[0]?.score && ranked[0].score >= 2 ? "alta" : ranked[0]?.score ? "media" : "baja",
    procedure: selected.procedure,
    suitableFor: selected.suitableFor,
    avoidOn: selected.avoidOn,
    catalogTerms: selected.catalogTerms,
    warnings: [...UNIVERSAL_WARNINGS, ...selected.warnings],
    clarifyingQuestions: [
      ...(needsSurface ? ["¿Sobre qué material o superficie está la mancha?"] : []),
      ...(!environment?.trim() ? ["¿Es un hogar, un comercio o una institución con protocolo propio?"] : []),
      "¿La etiqueta del producto o la superficie indica alguna incompatibilidad?",
    ],
  };
}
