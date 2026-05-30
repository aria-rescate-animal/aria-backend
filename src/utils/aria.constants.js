// ─── Constantes canónicas del sistema ARIA ────────────────────────
// Fuente única de verdad para backend — mantener sincronizado con frontend/src/lib/estados.js

const TIPOS_ENTIDAD = [
  'veterinaria',
  'fundacion',
  'autoridad_ambiental',
  'rescatista_organizado',
  'hogar_temporal',
  'otra',
]

const SERVICIOS = [
  'rescate_calle',
  'atencion_veterinaria',
  'hogar_temporal',
  'maltrato',
  'cautiverio',
  'fauna_silvestre',
  'adopcion_seguimiento',
]

const CATEGORIAS = [
  'abandono',
  'herido',
  'enfermo',
  'maltrato',
  'cautiverio',
  'fauna_silvestre',
  'no_estoy_seguro',
]

const ESTADOS = [
  'pendiente',
  'en_atencion',
  'rescatado',
  'no_procede',
  'requiere_revision',
]

const PRIORIDADES = ['normal', 'urgente']

const ESTADOS_REPORTE = ESTADOS
const CATEGORIAS_REPORTE = CATEGORIAS
const PRIORIDADES_REPORTE = PRIORIDADES
const SERVICIOS_ENTIDAD = SERVICIOS

const CATEGORIAS_REVISION_ADMIN = ['no_estoy_seguro']

const MAPA_CATEGORIA_SERVICIOS = {
  abandono:          ['rescate_calle', 'hogar_temporal', 'adopcion_seguimiento'],
  herido:            ['atencion_veterinaria', 'rescate_calle'],
  enfermo:           ['atencion_veterinaria', 'rescate_calle'],
  maltrato:          ['maltrato', 'rescate_calle'],
  cautiverio:        ['cautiverio'],
  fauna_silvestre:   ['fauna_silvestre'],
  no_estoy_seguro:   [],
}

const CATEGORIA_ALIAS = {
  sin_dueno:         'abandono',
  animal_sin_dueno: 'abandono',
  abandonado:       'abandono',
  abandono:         'abandono',
  riesgo:           'no_estoy_seguro',
  otro:             'no_estoy_seguro',
  desnutrido:       'enfermo',
  maltrato_cautiverio: 'maltrato',
}

const SERVICIO_ALIAS = {
  maltrato_cautiverio: ['maltrato', 'cautiverio'],
  recepcion_animales: [],
  traslado_animales: [],
  otro: [],
}

const normalizarCategoria = (cat) => {
  if (!cat) return 'no_estoy_seguro'
  const value = String(cat).trim()
  return CATEGORIA_ALIAS[value] || (CATEGORIAS.includes(value) ? value : 'no_estoy_seguro')
}

const categoriaRequiereRevision = (categoria) =>
  CATEGORIAS_REVISION_ADMIN.includes(normalizarCategoria(categoria))

const serviciosCompatiblesCategoria = (categoria) => {
  const normalizada = normalizarCategoria(categoria)
  return MAPA_CATEGORIA_SERVICIOS[normalizada] || []
}

const parseServicios = (servicios) => {
  if (!servicios) return []

  const limpiar = (valor) => String(valor)
    .trim()
    .replace(/^['"\[]+|['"\]]+$/g, '')
    .trim()

  const expandir = (items) => {
    const salida = []
    for (const raw of items.map(limpiar).filter(Boolean)) {
      if (SERVICIO_ALIAS[raw]) {
        salida.push(...SERVICIO_ALIAS[raw])
      } else {
        salida.push(raw)
      }
    }
    return Array.from(new Set(salida.filter(s => SERVICIOS.includes(s))))
  }

  if (Array.isArray(servicios)) return expandir(servicios)

  const raw = String(servicios).trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return expandir(parsed)
  } catch (_) {
    // Si no es JSON válido, se interpreta como CSV.
  }

  return expandir(raw.split(','))
}

const serviciosToArray = parseServicios

const normalizarNIT = (nit) => {
  if (!nit) return null
  const limpio = String(nit).replace(/[^0-9]/g, '')
  return limpio || null
}

module.exports = {
  TIPOS_ENTIDAD,
  SERVICIOS,
  CATEGORIAS,
  ESTADOS,
  PRIORIDADES,
  ESTADOS_REPORTE,
  CATEGORIAS_REPORTE,
  PRIORIDADES_REPORTE,
  SERVICIOS_ENTIDAD,
  MAPA_CATEGORIA_SERVICIOS,
  CATEGORIA_ALIAS,
  SERVICIO_ALIAS,
  CATEGORIAS_REVISION_ADMIN,
  normalizarCategoria,
  categoriaRequiereRevision,
  parseServicios,
  serviciosToArray,
  serviciosCompatiblesCategoria,
  normalizarNIT,
}
