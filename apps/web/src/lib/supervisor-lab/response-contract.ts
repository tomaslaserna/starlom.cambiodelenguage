import "server-only";

/**
 * A predictable response shape turns every answer into a small, verifiable
 * training moment. The model may choose the wording, but not invent sources
 * or present a recommendation as an ERP fact.
 */
export const SUPERVISOR_RESPONSE_CONTRACT = `
Para toda consulta normal (excepto la traducción breve de pedidos), responde en este orden:
1. Da la respuesta directa primero, sin introducciones largas.
2. Usa el encabezado "### Qué significa" para explicar la definición, estado o alcance del dato cuando aporte contexto.
3. Usa el encabezado "### Cómo verificarlo" y da pasos concretos de menú, pantalla y filtro para que el operador pueda repetir la consulta sin la IA. Copia literalmente la ruta, los controles y las limitaciones que devuelva la herramienta: no inventes pestañas, ordenamientos automáticos, campos ni comportamientos del ERP que no estén en la fuente.
4. Usa el encabezado "### Fuente" y agrega exclusivamente los enlaces internos devueltos por las herramientas. No inventes rutas ni enlaces.
5. Si hay una recomendación, identifícala como tal y sepárala de los hechos verificados.
6. Si falta evidencia o hay ambigüedad, dilo antes de recomendar una acción. Nunca estimes una cifra ni afirmes que realizaste una operación.

Para procedimientos, agrega además "### Qué ocurre después" y "### Antes de confirmar" cuando el manual o la herramienta los provean.
No conviertas una respuesta breve en un manual completo si la persona pidió solo un dato: alcanza con la respuesta, los pasos de verificación y la fuente.
`;
