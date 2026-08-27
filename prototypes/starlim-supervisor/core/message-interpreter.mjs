function normalize(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function interpretCustomerMessage({ message, customer, lastOrder }) {
  const text = normalize(message);
  const suggestions = [];
  const questions = [];

  if (/lo mismo|igual que (la|el) (otra|ultima) vez/.test(text)) {
    for (const item of lastOrder?.items ?? []) {
      suggestions.push({
        productId: item.productId,
        name: item.name,
        quantity: Number(item.quantity),
        confidence: "high",
        evidence: `Incluido en el último pedido de ${customer.name}.`,
      });
    }
  }

  const bleach = suggestions.find((item) => /hipoclorito|lavandina/.test(normalize(item.name)));
  const extraBleach = text.match(/(\d+)\s+(?:lavandinas?|bidones?)(?:\s+mas)?/);
  if (bleach && extraBleach) {
    bleach.quantity += Number(extraBleach[1]);
    bleach.evidence += ` Se sumaron ${extraBleach[1]} unidades por el mensaje.`;
  }

  if (/bolsas? grandes?/.test(text)) {
    const largeBag = (customer.productAliases ?? []).find((alias) => alias.alias === "bolsa grande");
    if (largeBag && !suggestions.some((item) => item.productId === largeBag.productId)) {
      suggestions.push({ ...largeBag, quantity: largeBag.usualQuantity, confidence: "high", evidence: "Coincide con la bolsa grande habitual del cliente." });
    }
  }

  if (/coso del bano|cosa del bano|para el bano/.test(text)) {
    questions.push({ phrase: "el coso del baño", alternatives: ["Filtro para mingitorio", "Pastillas para inodoro"], reason: "La frase coincide con más de un producto posible." });
  }

  return {
    customerId: customer.id,
    customerName: customer.name,
    suggestions,
    questions,
    confidence: questions.length ? "medium" : suggestions.length ? "high" : "low",
    safeToCreateDraft: suggestions.length > 0,
    safeToSubmitOrder: false,
  };
}
