// Texto por defecto de las secciones narrativas de cada plantilla de propuesta
// (HT-AP-03 nota de cambio v1.18, decisión 2: texto libre editable con default
// de la plantilla). Extraído literal de los 4 .docx corporativos
// (HTCO01-04) — son el punto de partida que el operador edita para el
// proyecto específico, no se guardan como texto fijo.

const DEFAULTS = {
  ninguna: {
    objeto_propuesta: '',
    alcances_texto: '',
    exclusiones_texto: '',
    condiciones_ejecucion_texto: '',
    otras_consideraciones_texto: '',
  },
  simple_suministro: {
    objeto_propuesta: 'La presente propuesta tiene por objeto establecer las condiciones técnicas y comerciales para la prestación del servicio de suministro de [equipamiento principal] del proyecto previamente identificado.',
    alcances_texto: 'Se incluye el suministro, con despacho a sitio del proyecto, de los siguientes equipos principales: [detallar ítems, marca/modelo, unidad y cantidad].',
    exclusiones_texto: '- Elementos, piezas especiales y tuberías no incluidos en la presente propuesta.\n- Obras civiles, losas, excavaciones, pozos o adecuaciones estructurales.\n- Instalación y/o montaje (salvo que se indique expresamente).\n- Trabajos fuera del alcance descrito.\n- Tramitación de permisos y autorizaciones ante organismos públicos.',
    condiciones_ejecucion_texto: '',
    otras_consideraciones_texto: '- HidroTecnica garantiza por 2 años los suministros aportados, lo que no incluye el mal uso o la manipulación de terceros no capacitados.\n- Esta Oferta es válida para la adjudicación total de los alcances propuestos y no para una parcialidad de ellos. Tiene una validez de [N] días corridos desde la fecha de emisión.\n- Se deberán coordinar la ejecución de los trabajos propuestos con al menos [N] semanas de anticipación, o de mutuo acuerdo entre las partes.',
  },
  estandar_suministro_montaje: {
    objeto_propuesta: 'La presente propuesta tiene por objeto establecer las condiciones técnicas y comerciales para la prestación del servicio de montaje / suministro y montaje de [descripción del sistema], incluyendo el suministro e instalación de tuberías, fittings y cableado eléctrico asociado.',
    alcances_texto: 'Instalación de la totalidad de equipos correspondientes al sistema: [posicionamiento e instalación de equipo/estanque, bombas, tablero eléctrico, manifolds/válvulas].\n\nSistema de tuberías, válvulas y cableado eléctrico: suministro e instalación de materiales menores y tuberías (excluyendo equipos principales).\n\nPruebas y puesta en marcha: prueba hidráulica del sistema completo, puesta en marcha integral, registro en Fracttal®.',
    exclusiones_texto: '- Suministro de equipos principales (si se cotiza aparte — indicar N° de cotización).\n- Piezas y tuberías embebidas.\n- Obras civiles, losas, excavaciones, pozos o adecuaciones estructurales.\n- Acometida eléctrica desde red existente hasta tablero.\n- Boletas ni pólizas de garantía.\n- Trabajos fuera del alcance descrito.\n- Tramitación de permisos y autorizaciones ante organismos públicos.',
    condiciones_ejecucion_texto: '- Se contempla la ejecución de las actividades de montaje en [N] jornadas ordinarias de trabajo continuas (no considera trabajo nocturno ni sábado o domingo).\n- Fecha prevista de inicio: [fecha/semana], sujeta a adjudicación y disponibilidad de equipos.\n- El cliente deberá entregar el recinto libre de interferencias y con acceso al punto de acometida existente.\n- HidroTecnica designará un coordinador responsable de la obra para el control técnico y de seguridad.',
    otras_consideraciones_texto: '- HidroTecnica garantiza la correcta ejecución de los trabajos realizados por un plazo de 1 año, y por 2 años por los suministros aportados.\n- Esta Oferta es válida para la adjudicación total de los alcances propuestos y no para una parcialidad de ellos, y tiene una validez de [N] días corridos desde la fecha de emisión.\n- El Cliente será responsable de entregar el recinto donde se realizarán los trabajos en condiciones de ejecutar éstos.',
  },
  llave_en_mano_regulado: {
    objeto_propuesta: 'La presente propuesta tiene por objeto establecer las condiciones técnicas y comerciales para la prestación del servicio de suministros, montajes y puesta en marcha de elementos que conforman el sistema de [agua potable / aguas lluvia / otro] descrito más adelante, del recinto de [Cliente final] ubicado en [dirección], comuna de [comuna], región de [región].',
    alcances_texto: '- Suministro, instalación y puesta en marcha del Sistema.\n- Equipamiento: bombas de impulsión y sentinas; válvulas de corte, de control, de seguridad, solenoides; juntas de conexión, etc.\n- Piping completo al interior del recinto del Sistema.\n- Tablero eléctrico con canalizado y cableado de elementos periféricos.\n- Ingeniería de integración y calidad; entrega de dossier técnico y certificados.\n- Registro en plataforma Fracttal®.',
    exclusiones_texto: '- Suministro e instalación de equipos no especificados.\n- Elementos, piezas especiales y tuberías no incluidos en la presente propuesta.\n- Obras civiles, losas, escalines, excavaciones, pozos o adecuaciones estructurales.\n- Acometida eléctrica desde red existente hasta tablero.\n- Trabajos fuera del alcance descrito.\n- Tramitación de permisos y autorizaciones ante organismos públicos.',
    condiciones_ejecucion_texto: 'HidroTecnica debe contar con carta de adjudicación u orden de proceder u orden de compra por parte del Cliente. Se debe verificar el pago del monto inicial establecido.\n\nAntes de iniciar trabajos en sitio: el Cliente debe informar a HidroTecnica con un plazo no menor a 3 semanas el programa de inicio de actividades, con aprobación de la ITO del cliente final.\n\nPara la puesta en marcha: HidroTecnica realizará un informe de precomisionamiento; al finalizar se entregan Planos As-Built, Fichas técnicas, Manual de operación, Manual de mantención, Diagrama unilineal, Contacto post venta y Acta de charla de inducción.',
    otras_consideraciones_texto: '- HidroTecnica garantiza la correcta ejecución de los trabajos por un plazo de 1 año, y por 2 años por los suministros, además de las garantías legales.\n- Esta Propuesta es válida para la adjudicación total de los alcances propuestos y no para una parcialidad de ellos. Tiene una vigencia de [N] días a contar de la fecha de su envío al Cliente.\n- Los trabajos se realizarán en base a la legislación y normativa vigente en Chile al momento de la presentación de ésta.',
  },
  lavado_sanitizacion: {
    objeto_propuesta: 'El presente documento establece la metodología, actividades y controles necesarios para la ejecución de trabajos de limpieza y desinfección de estanques de acumulación de agua potable en las dependencias indicadas por el Cliente, asegurando el cumplimiento de las exigencias de la autoridad sanitaria.',
    alcances_texto: 'Metodología de trabajo: 1) Coordinación de acceso. 2) Inspección inicial de estanques y tapas. 3) Maniobras previas al lavado (baja de nivel, uso de arnés sobre 1,5 m). 4) Lavado y sanitizado con hipoclorito de sodio al 10%. 5) Enjuague y llenado final. 6) Verificación de sensores/válvulas/bombeo. 7) Toma de muestras y Certificado de Lavado según NCh 409/1. 8) Entrega e informe fotográfico vía Fracttal Asset Cloud.',
    exclusiones_texto: '- Reparaciones estructurales.\n- Reemplazo de válvulas u otros elementos.\n- Otros trabajos no contemplados en el alcance descrito.',
    condiciones_ejecucion_texto: '- Plazo de ejecución: a coordinar con el Cliente según disponibilidad de acceso a la instalación.\n- Frecuencia sugerida: lavado anual por cada estanque, según normativa sanitaria vigente.\n- Uso obligatorio de arnés de seguridad en válvulas o accesos sobre 1,5 m de altura.',
    otras_consideraciones_texto: '- Esta oferta tiene una validez de 30 días corridos desde su emisión.\n- El valor no incluye reparaciones estructurales, reemplazo de válvulas u otros trabajos no contemplados en el alcance descrito.',
  },
};

const TIPOS_VALIDOS = Object.keys(DEFAULTS);

module.exports = { DEFAULTS, TIPOS_VALIDOS };
