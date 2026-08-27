"use client";

import { useRef, useState } from "react";
import { Button, ButtonLink, Field, Input, Select } from "@/components/ui";
import { uploadProductImage } from "@/app/prices/upload-product-image";

type MarginOption = { code: string; name: string };

export function NewProductForm({
  action,
  margins,
}: {
  action: (formData: FormData) => Promise<void>;
  margins: MarginOption[];
}) {
  const [imagePath, setImagePath] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSelectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImageError("");
    try {
      const path = await uploadProductImage(file);
      setImagePath(path);
      setPreview(URL.createObjectURL(file));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "No se pudo subir la imagen");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  function clearImage() {
    setImagePath("");
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <input name="imagePath" type="hidden" value={imagePath} />

      <Field htmlFor="product-name" label="Nombre" required>
        <Input id="product-name" maxLength={255} name="name" required />
      </Field>
      <Field htmlFor="product-sku" label="Código / SKU" description="Debe ser único si se informa.">
        <Input id="product-sku" maxLength={80} name="sku" />
      </Field>
      <Field htmlFor="product-code" label="Categoría de precio" required>
        <Select id="product-code" name="code" required>
          <option value="">Seleccionar categoría</option>
          {margins.map((margin) => (
            <option key={margin.code} value={margin.code}>
              {margin.code} - {margin.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field htmlFor="product-cost" label="Costo" required>
        <Input id="product-cost" inputMode="decimal" name="cost" required step="0.01" type="number" />
      </Field>
      <Field htmlFor="product-stock" label="Stock inicial" description="Primera carga de stock del producto. Puede ser 0.">
        <Input defaultValue="0" id="product-stock" inputMode="numeric" min="0" name="stock" step="1" type="number" />
      </Field>
      <Field
        htmlFor="product-presentation"
        label="Presentación"
        description="Unidades por bulto o paquete. Ej.: 12 para una rejilla que viene de a 12."
      >
        <Input defaultValue="1" id="product-presentation" inputMode="numeric" max="9999" min="1" name="presentationUnits" required step="1" type="number" />
      </Field>
      <Field htmlFor="product-provider" label="Proveedor">
        <Input id="product-provider" maxLength={255} name="provider" />
      </Field>

      <div className="lg:col-span-2">
        <span className="erp-text-caption font-semibold text-[#64748b]">Imagen (opcional)</span>
        <div className="mt-1 flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-inset ring-[#e2e8f0]" src={preview} />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[#f1f5f9] text-xs text-[#94a3b8] ring-1 ring-inset ring-[#e2e8f0]">
              Sin imagen
            </div>
          )}
          <div className="flex flex-col items-start gap-1">
            <Button disabled={uploading} onClick={() => inputRef.current?.click()} size="sm" type="button" variant="secondary">
              {uploading ? "Subiendo…" : preview ? "Cambiar" : "Subir imagen"}
            </Button>
            {preview ? (
              <button className="text-xs text-[#dc2626] hover:underline" onClick={clearImage} type="button">
                Quitar
              </button>
            ) : null}
            {imageError ? <span className="text-xs font-semibold text-[#dc2626]">{imageError}</span> : null}
          </div>
          <input accept="image/*" className="hidden" onChange={onSelectImage} ref={inputRef} type="file" />
        </div>
      </div>

      <div className="flex gap-2 lg:col-span-2">
        <Button disabled={uploading} type="submit">
          Crear producto
        </Button>
        <ButtonLink href="/prices" variant="outline">
          Volver a la lista
        </ButtonLink>
      </div>
    </form>
  );
}
