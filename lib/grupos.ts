// Sin dependencias de servidor: lo usa también el formulario del navegador.
/** Grupos del Compendio Nacional. Los de la farmacia vienen del archivo de grupos; se agregan Oncología y Vacunas para altas futuras. */
export const GRUPOS_TERAPEUTICOS = [
  'Analgesia', 'Anestesia', 'Cardiología', 'Dermatología', 'Endocrinología y Metabolismo', 'Enfermedades Infecciosas y Parasitarias',
  'Enfermedades Inmunoalérgicas', 'Estomatología (uso bucal)', 'Gastroenterología', 'Gineco-Obstetricia', 'Hematología', 'Intoxicaciones',
  'Nefrología y Urología', 'Neumología', 'Neurología', 'Nutriología', 'Oftalmología', 'Oncología', 'Otorrinolaringología',
  'Planificación Familiar', 'Psiquiatría', 'Reumatología y Traumatología', 'Soluciones Electrolíticas y Sustitutos del Plasma',
  'Vacunas, Toxoides, Inmunoglobulinas, Antitoxinas',
] as const;
