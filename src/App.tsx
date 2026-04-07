import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { 
  MessageSquare, 
  Send, 
  BookOpen, 
  HelpCircle, 
  RefreshCw, 
  Calculator, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  User,
  Bot,
  Settings,
  Plus,
  Trash2,
  X,
  Maximize2,
  Minimize2,
  Save,
  FolderOpen,
  Type,
  Minus,
  Columns,
  Layout,
  GripVertical,
  Heart,
  Trophy,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  balance?: BalanceState;
  journal?: JournalEntry[];
}

interface JournalEntry {
  code?: string;
  account: string;
  debe: number;
  haber: number;
  date?: string;
}

interface BalanceItem {
  name: string;
  amount: number;
  code?: string; // Código PGC para ordenación
}

interface BalanceState {
  assets: {
    nonCurrent: BalanceItem[];
    current: BalanceItem[];
  };
  liabilitiesAndEquity: {
    equity: BalanceItem[];
    nonCurrent: BalanceItem[];
    current: BalanceItem[];
  };
}

interface AccountDraft {
  code: string;
  account: string;
  debe: string;
  haber: string;
  reflected?: boolean;
}

const formatCurrency = (value: number): string => {
  const hasDecimals = value % 1 !== 0;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value) + '€';
};

// --- Constants ---
const MODULE_ACCOUNTS: Record<number, { code: string, name: string, examples?: string[] }[]> = {
  1: [
    { code: '100', name: 'Capital social', examples: ['Aportaciones de los socios al constituir una sociedad anónima o limitada y ampliaciones de capital acordadas para incorporar nuevos accionistas'] },
    { code: '101', name: 'Fondo social', examples: ['Aportación inicial de los miembros al crear una entidad sin ánimo de lucro o asociación'] },
    { code: '102', name: 'Capital', examples: ['Aportación inicial de dinero realizada por un empresario individual para crear su negocio'] },
    { code: '103', name: 'Socios por desembolsos no exigidos', examples: ['Parte del capital social suscrito que los accionistas aún no han aportado y que la sociedad todavía no les ha reclamado'] },
    { code: '112', name: 'Reserva legal' },
    { code: '203', name: 'Propiedad industrial', examples: ['Adquisición de una patente (por ejemplo, para fabricar carne vegetal)'] },
    { code: '205', name: 'Derechos de traspaso', examples: ['Pago realizado al anterior arrendatario de un local para subrogarse en su contrato y convertirse en el nuevo inquilino'] },
    { code: '206', name: 'Aplicaciones informáticas', examples: ['Compra de software, programas informáticos o gastos de desarrollo de una página web'] },
    { code: '210', name: 'Terrenos y bienes naturales', examples: ['Valor del suelo o solares urbanos donde se asientan las oficinas, naves o edificios de la empresa'] },
    { code: '211', name: 'Construcciones', examples: ['Edificaciones como locales de oficinas, naves industriales u hoteles propiedad de la firma'] },
    { code: '212', name: 'Instalaciones técnicas', examples: ['Equipos especializados como aparatos quirúrgicos, equipos de generación de energía o maquinaria avanzada de proceso productivo'] },
    { code: '213', name: 'Maquinaria', examples: ['Máquinas de uso industrial general o equipos industriales para la fabricación'] },
    { code: '215', name: 'Otras instalaciones', examples: ['Instalaciones deportivas para empleados (pistas de fútbol/baloncesto) u otros elementos no clasificados anteriormente'] },
    { code: '216', name: 'Mobiliario', examples: ['Sillas, mesas de oficina y estanterías'] },
    { code: '217', name: 'Equipos para procesos de información', examples: ['Ordenadores, servidores y conjuntos electrónicos'] },
    { code: '218', name: 'Elementos de transporte', examples: ['Vehículos como furgonetas o camiones para el transporte de personas o mercancías'] },
    { code: '240', name: 'Participaciones a largo plazo en partes vinculadas', examples: ['Compra de acciones de una empresa del mismo grupo sin intención de venderlas pronto'] },
    { code: '251', name: 'Valores representativos de deuda a largo plazo', examples: ['Inversión en bonos del Tesoro o títulos de renta fija con vencimiento a cinco años'] },
    { code: '430', name: 'Clientes', examples: ['Derechos de cobro en factura por la venta habitual de productos o servicios (ej. asesoría o viajes combinados)'] },
    { code: '431', name: 'Clientes, efectos comerciales a cobrar', examples: ['Derechos de cobro sobre clientes que han aceptado una letra de cambio o pagaré'] },
    { code: '472', name: 'Hacienda Pública, IVA soportado', examples: ['Impuesto pagado al comprar bienes o servicios (maquinaria, mercaderías, luz)'] },
    { code: '540', name: 'Inversiones financieras a corto plazo en instrumentos de patrimonio', examples: ['Compra de acciones en bolsa con intención especulativa (venta rápida)'] },
    { code: '541', name: 'Valores representativos de deuda a corto plazo', examples: ['Bonos del Tesoro o de empresas con vencimiento a 12 meses o menos'] },
    { code: '542', name: 'Créditos a corto plazo', examples: ['Dinero prestado a un tercero a devolver en seis meses'] },
    { code: '548', name: 'Imposiciones a corto plazo', examples: ['Depósitos bancarios "a plazo" de tres o seis meses'] },
    { code: '558', name: 'Socios por desembolsos exigidos', examples: ['Capital que la empresa ya ha reclamado formalmente a los accionistas para que lo aporten'] },
    { code: '565', name: 'Fianzas constituidas a corto plazo', examples: ['Garantía en efectivo pagada al firmar un contrato que será devuelta en 12 meses'] },
    { code: '570', name: 'Caja', examples: ['Dinero en efectivo (billetes y monedas) disponible en la caja fuerte'] },
    { code: '572', name: 'Bancos', examples: ['Saldo disponible en cuentas corrientes o de ahorro en euros'] },
    { code: '573', name: 'Bancos, moneda extranjera', examples: ['Saldo en cuentas bancarias denominadas en divisas como dólares'] },
    { code: '170', name: 'Deudas a largo plazo con entidades de crédito', examples: ['Préstamos bancarios con vencimiento superior a un año y deudas que, tras una reclasificación, permanecen a largo plazo'] },
    { code: '173', name: 'Proveedores de inmovilizado a largo plazo', examples: ['Deuda con el vendedor de una máquina o furgoneta a pagar en un plazo de 18 meses o más'] },
    { code: '175', name: 'Efectos a pagar a largo plazo', examples: ['Letras de cambio aceptadas por la compra de un edificio con vencimiento a dos años'] },
    { code: '180', name: 'Fianzas recibidas a largo plazo', examples: ['Dinero recibido de un inquilino como garantía de cumplimiento de un contrato de alquiler a seis años'] },
    { code: '400', name: 'Proveedores', examples: ['Deudas en factura por compra de electrodomésticos, material de oficina o suministros de limpieza para el tráfico comercial'] },
    { code: '401', name: 'Proveedores, efectos comerciales a pagar', examples: ['Deuda comercial formalizada mediante la aceptación de una letra de cambio o pagaré'] },
    { code: '477', name: 'Hacienda Pública, IVA repercutido', examples: ['Impuesto cobrado a los clientes al venderles productos o prestarles servicios'] },
    { code: '5200', name: 'Préstamos a corto plazo con entidades de crédito', examples: ['Deuda bancaria que vence en el año actual o parte de un préstamo a largo plazo reclasificado'] },
    { code: '523', name: 'Proveedores de inmovilizado a corto plazo', examples: ['Deuda con el vendedor de un ordenador o mobiliario a pagar en menos de un año'] },
    { code: '525', name: 'Efectos a pagar a corto plazo' },
    { code: '560', name: 'Fianzas recibidas a corto plazo' }
  ],
  2: [
    { code: '100', name: 'Capital social', examples: ['Aportaciones de los socios al constituir una sociedad anónima o limitada y ampliaciones de capital acordadas para incorporar nuevos accionistas'] },
    { code: '103', name: 'Socios por desembolsos no exigidos', examples: ['Parte del capital social suscrito que los accionistas aún no han aportado y que la sociedad todavía no les ha reclamado'] },
    { code: '112', name: 'Reserva legal' },
    { code: '170', name: 'Deudas a largo plazo con entidades de crédito', examples: ['Préstamos bancarios con vencimiento superior a un año y deudas que, tras una reclasificación, permanecen a largo plazo'] },
    { code: '173', name: 'Proveedores de inmovilizado a largo plazo', examples: ['Deuda con el vendedor de una máquina o furgoneta a pagar en un plazo de 18 meses o más'] },
    { code: '175', name: 'Efectos a pagar a largo plazo', examples: ['Letras de cambio aceptadas por la compra de un edificio con vencimiento a dos años'] },
    { code: '180', name: 'Fianzas recibidas a largo plazo', examples: ['Dinero recibido de un inquilino como garantía de cumplimiento de un contrato de alquiler a seis años'] },
    { code: '203', name: 'Propiedad industrial', examples: ['Adquisición de una patente (por ejemplo, para fabricar carne vegetal)'] },
    { code: '205', name: 'Derechos de traspaso', examples: ['Pago realizado al anterior arrendatario de un local para subrogarse en su contrato y convertirse en el nuevo inquilino'] },
    { code: '206', name: 'Aplicaciones informáticas', examples: ['Compra de software, programas informáticos o gastos de desarrollo de una página web'] },
    { code: '210', name: 'Terrenos y bienes naturales', examples: ['Valor del suelo o solares urbanos donde se asientan las oficinas, naves o edificios de la empresa'] },
    { code: '211', name: 'Construcciones', examples: ['Edificaciones como locales de oficinas, naves industriales u hoteles propiedad de la firma'] },
    { code: '212', name: 'Instalaciones técnicas', examples: ['Equipos especializados como aparatos quirúrgicos, equipos de generación de energía o maquinaria avanzada de proceso productivo'] },
    { code: '216', name: 'Mobiliario', examples: ['Sillas, mesas de oficina y estanterías'] },
    { code: '217', name: 'Equipos para procesos de información', examples: ['Ordenadores, servidores y conjuntos electrónicos'] },
    { code: '218', name: 'Elementos de transporte', examples: ['Vehículos como furgonetas o camiones para el transporte de personas o mercancías'] },
    { code: '251', name: 'Valores representativos de deuda a largo plazo', examples: ['Inversión en bonos del Tesoro o títulos de renta fija con vencimiento a cinco años'] },
    { code: '472', name: 'Hacienda Pública, IVA soportado', examples: ['Impuesto pagado al comprar bienes o servicios (maquinaria, mercaderías, luz)'] },
    { code: '477', name: 'Hacienda Pública, IVA repercutido', examples: ['Impuesto cobrado a los clientes al venderles productos o prestarles servicios'] },
    { code: '5200', name: 'Préstamos a corto plazo con entidades de crédito', examples: ['Deuda bancaria que vence en el año actual o parte de un préstamo a largo plazo reclasificado'] },
    { code: '523', name: 'Proveedores de inmovilizado a corto plazo', examples: ['Deuda con el vendedor de un ordenador o mobiliario a pagar en menos de un año'] },
    { code: '540', name: 'Inversiones financieras a corto plazo en instrumentos de patrimonio', examples: ['Compra de acciones en bolsa con intención especulativa (venta rápida)'] },
    { code: '541', name: 'Valores representativos de deuda a corto plazo', examples: ['Bonos del Tesoro o de empresas con vencimiento a 12 meses o menos'] },
    { code: '542', name: 'Créditos a corto plazo', examples: ['Dinero prestado a un tercero a devolver en seis meses'] },
    { code: '558', name: 'Socios por desembolsos exigidos', examples: ['Capital que la empresa ya ha reclamado formalmente a los accionistas para que lo aporten'] },
    { code: '565', name: 'Fianzas constituidas a corto plazo', examples: ['Garantía en efectivo pagada al firmar un contrato que será devuelta en 12 meses'] },
    { code: '572', name: 'Bancos', examples: ['Saldo disponible en cuentas corrientes o de ahorro en euros'] },
    { code: '573', name: 'Bancos, moneda extranjera', examples: ['Saldo en cuentas bancarias denominadas en divisas como dólares'] },
    { code: '214', name: 'Utillaje', examples: ['Herramientas y utensilios para el almacén o la fábrica'] },
    { code: '219', name: 'Otro inmovilizado material', examples: ['Papeleras, contenedores y envases que no se consumen inmediatamente'] },
    { code: '250', name: 'Inversiones financieras a largo plazo en instrumentos de patrimonio' },
    { code: '252', name: 'Créditos a largo plazo', examples: ['Dinero prestado a un tercero (amigo o empresa no vinculada) a devolver en más de un año'] },
    { code: '258', name: 'Imposiciones a largo plazo', examples: ['Depósitos bancarios "a plazo" con compromiso de no retirar el dinero en 18 meses'] },
    { code: '260', name: 'Garantías financieras a largo plazo (Avales)', examples: ['Avales en efectivo recibidos por aceptar flexibilidad en las obligaciones de un contrato'] }
  ],
  3: [
    { code: '600', name: 'Compra de mercaderías', examples: ['Adquisición de productos para reventa (fruta, ordenadores, electrodomésticos) como actividad principal de la empresa, incluyendo el transporte de las compras a cargo del comprador'] },
    { code: '601', name: 'Compra de materias primas', examples: ['Compra de madera para fabricar muebles'] },
    { code: '602', name: 'Compras de otros aprovisionamientos', examples: ['Compra de materiales fungibles (papel, tinta, artículos de limpieza, gasolina o envases no retornables)'] },
    { code: '606', name: 'Descuentos sobre compras por pronto pago' },
    { code: '608', name: 'Devoluciones de compras' },
    { code: '609', name: '"Rappels" por compras', examples: ['Descuentos fuera de factura por haber alcanzado un gran volumen de pedidos'] },
    { code: '610', name: 'Variación de existencias' },
    { code: '620', name: 'Gastos en I+D' },
    { code: '621', name: 'Arrendamientos y cánones', examples: ['Alquiler del local', 'Alquiler de una furgoneta'] },
    { code: '622', name: 'Reparaciones y conservación', examples: ['Reparación de una máquina', 'Pintado de la oficina'] },
    { code: '623', name: 'Servicios de profesionales independientes', examples: ['Honorarios de economistas, abogados, auditores, notarios, gestorías y contratas de limpieza'] },
    { code: '624', name: 'Transportes (en ventas)', examples: ['Gasto por enviar las ventas a los clientes mediante un transportista externo'] },
    { code: '625', name: 'Primas de seguros', examples: ['Seguro del local contra incendios', 'Seguro de responsabilidad civil'] },
    { code: '626', name: 'Servicios bancarios', examples: ['Comisiones de mantenimiento de cuenta o por descubierto'] },
    { code: '628', name: 'Suministros', examples: ['Consumo de agua, gas y electricidad'] },
    { code: '629', name: 'Otros servicios (teléfono, viajes)', examples: ['Gastos de teléfono, viajes del personal o el transporte de empleados a la fábrica'] },
    { code: '650', name: 'Pérdidas de créditos comerciales incobrables', examples: ['Deudas de clientes declarados en concurso de acreedores o insolventes que se dan por perdidas'] },
    { code: '662', name: 'Intereses de deudas' },
    { code: '678', name: 'Gastos excepcionales (multas, incendios)', examples: ['Recoge multas fiscales, pérdidas por incendios (furgoneta carbonizada), inundaciones o sanciones'] },
    { code: '700', name: 'Venta de mercaderías', examples: ['Ingresos por la venta habitual de los productos de la empresa (actividad principal)'] },
    { code: '701', name: 'Venta de productos terminados' },
    { code: '704', name: 'Venta de envases y embalajes' },
    { code: '705', name: 'Prestación de servicios', examples: ['Facturación por alojamiento en hoteles, restauración, servicios postventa o asesoramiento laboral (cuando es la actividad principal de la empresa)'] },
    { code: '706', name: 'Descuentos sobre ventas por pronto pago' },
    { code: '708', name: 'Devoluciones de ventas' },
    { code: '709', name: '"Rappels" sobre ventas' },
    { code: '752', name: 'Ingresos por arrendamientos', examples: ['Cobro del alquiler de una oficina o sala de conferencias propiedad de la firma (cuando es una actividad secundaria o accidental)'] },
    { code: '754', name: 'Ingresos por comisiones' },
    { code: '755', name: 'Ingresos por servicios al personal' },
    { code: '760', name: 'Ingresos de participaciones en instrumentos de patrimonio (dividendos)', examples: ['Cobro de dividendos de las acciones de las que la empresa es titular'] },
    { code: '766', name: 'Beneficios en participaciones y valores representativos de deuda' },
    { code: '769', name: 'Otros ingresos financieros (intereses bancarios)', examples: ['Intereses a favor generados por el dinero en el banco'] },
    { code: '129', name: 'Resultado del ejercicio' },
    { code: '300', name: 'Mercaderías (existencias en almacén)', examples: ['Valor de los productos en almacén para reventa como muebles de cocina, tinta de impresora o frutas'] },
    { code: '4009', name: 'Proveedores, facturas pendientes de recibir', examples: ['Compra de mercaderías cuando la mercancía ya ha llegado pero la factura aún no se ha recibido'] },
    { code: '404', name: 'Proveedores, empresas asociadas' },
    { code: '406', name: 'Envases a devolver a proveedores', examples: ['Recipientes retornables que el suministrador carga en factura con facultad de devolución'] },
    { code: '407', name: 'Anticipos a proveedores', examples: ['Dinero entregado "a cuenta" para asegurar una futura compra de productos'] },
    { code: '410', name: 'Acreedores por prestación de servicios', examples: ['Deuda por reparaciones en la oficina, honorarios de abogados/gestores, servicios de teléfono o limpieza'] },
    { code: '434', name: 'Clientes, empresas asociadas' },
    { code: '438', name: 'Anticipos de clientes', examples: ['Dinero recibido de un comprador antes de entregarle los productos o servicios'] },
    { code: '440', name: 'Deudores', examples: ['Derechos de cobro por actividades secundarias como mediación (comisiones) o alquiler accidental de salas'] },
    { code: '473', name: 'Hacienda Pública, retenciones y pagos a cuenta', examples: ['Pagos anticipados de impuestos retenidos por el banco al abonarnos intereses o dividendos'] }
  ],
  5: [
    { code: '100', name: 'Capital social', examples: ['Aportaciones de los socios al constituir una sociedad anónima o limitada y ampliaciones de capital acordadas para incorporar nuevos accionistas'] },
    { code: '112', name: 'Reserva legal' },
    { code: '129', name: 'Resultado del ejercicio' },
    { code: '170', name: 'Deudas a largo plazo con entidades de crédito', examples: ['Préstamos bancarios con vencimiento superior a un año y deudas que, tras una reclasificación, permanecen a largo plazo'] },
    { code: '216', name: 'Mobiliario', examples: ['Sillas, mesas de oficina y estanterías'] },
    { code: '217', name: 'Equipos para procesos de información', examples: ['Ordenadores, servidores y conjuntos electrónicos'] },
    { code: '218', name: 'Elementos de transporte', examples: ['Vehículos como furgonetas o camiones para el transporte de personas o mercancías'] },
    { code: '300', name: 'Mercaderías (existencias en almacén)', examples: ['Valor de los productos en almacén para reventa como muebles de cocina, tinta de impresora o frutas'] },
    { code: '400', name: 'Proveedores', examples: ['Deudas en factura por compra de electrodomésticos, material de oficina o suministros de limpieza para el tráfico comercial'] },
    { code: '407', name: 'Anticipos a proveedores', examples: ['Dinero entregado "a cuenta" para asegurar una futura compra de productos'] },
    { code: '430', name: 'Clientes', examples: ['Derechos de cobro en factura por la venta habitual de productos o servicios (ej. asesoría o viajes combinados)'] },
    { code: '431', name: 'Clientes, efectos comerciales a cobrar', examples: ['Derechos de cobro sobre clientes que han aceptado una letra de cambio o pagaré'] },
    { code: '472', name: 'Hacienda Pública, IVA soportado', examples: ['Impuesto pagado al comprar bienes o servicios (maquinaria, mercaderías, luz)'] },
    { code: '477', name: 'Hacienda Pública, IVA repercutido', examples: ['Impuesto cobrado a los clientes al venderles productos o prestarles servicios'] },
    { code: '5200', name: 'Préstamos a corto plazo con entidades de crédito', examples: ['Deuda bancaria que vence en el año actual o parte de un préstamo a largo plazo reclasificado'] },
    { code: '523', name: 'Proveedores de inmovilizado a corto plazo', examples: ['Deuda con el vendedor de un ordenador o mobiliario a pagar en menos de un año'] },
    { code: '572', name: 'Bancos', examples: ['Saldo disponible en cuentas corrientes o de ahorro en euros'] },
    { code: '600', name: 'Compra de mercaderías', examples: ['Adquisición de productos para reventa (fruta, ordenadores, electrodomésticos) como actividad principal de la empresa, incluyendo el transporte de las compras a cargo del comprador'] },
    { code: '609', name: '"Rappels" por compras', examples: ['Descuentos fuera de factura por haber alcanzado un gran volumen de pedidos'] },
    { code: '610', name: 'Variación de existencias' },
    { code: '624', name: 'Transportes (en ventas)', examples: ['Gasto por enviar las ventas a los clientes mediante un transportista externo'] },
    { code: '628', name: 'Suministros', examples: ['Consumo de agua, gas y electricidad'] },
    { code: '700', name: 'Venta de mercaderías', examples: ['Ingresos por la venta habitual de los productos de la empresa (actividad principal)'] },
    { code: '706', name: 'Descuentos sobre ventas por pronto pago' },
    { code: '4700', name: 'Hacienda Pública, deudora por IVA (a devolver)' },
    { code: '4750', name: 'Hacienda Pública, acreedora por IVA (a pagar)' }
  ]
};

const ACCOUNT_MAPPING: Record<string, string> = {
  '100': 'Capital Social',
  '101': 'Fondo social',
  '102': 'Capital',
  '103': 'Socios por desembolsos no exigidos',
  '104': 'Socios por aportaciones no dinerarias pendientes',
  '108': 'Acciones o participaciones propias en situaciones especiales',
  '109': 'Acciones o participaciones propias para reducción de capital',
  '110': 'Prima de emisión o asunción',
  '111': 'Otros instrumentos de patrimonio neto',
  '112': 'Reserva legal',
  '113': 'Reservas voluntarias',
  '114': 'Reservas especiales',
  '118': 'Aportaciones de socios o propietarios',
  '120': 'Remanente',
  '121': 'Resultados negativos de ejercicios anteriores',
  '129': 'Resultado del ejercicio',
  '130': 'Subvenciones oficiales de capital',
  '140': 'Provisión para retribuciones a largo plazo al personal',
  '150': 'Acciones o participaciones a L/P consideradas pasivos financieros',
  '160': 'Deudas a largo plazo con entidades de crédito vinculadas',
  '170': 'Deudas a largo plazo con entidades de crédito',
  '171': 'Deudas a largo plazo',
  '180': 'Fianzas recibidas a largo plazo',
  '190': 'Acciones o participaciones emitidas',
  '194': 'Capital emitido pendiente de inscripción',
  '200': 'Investigación',
  '201': 'Desarrollo',
  '202': 'Concesiones administrativas',
  '203': 'Propiedad industrial',
  '206': 'Aplicaciones informáticas',
  '210': 'Terrenos y bienes naturales',
  '211': 'Construcciones',
  '213': 'Maquinaria',
  '214': 'Utillaje',
  '216': 'Mobiliario',
  '217': 'Equipos para procesos de información',
  '218': 'Elementos de transporte',
  '219': 'Otro inmovilizado material',
  '220': 'Inversiones en terrenos y bienes naturales',
  '230': 'Adaptación de terrenos y bienes naturales',
  '250': 'Inversiones financieras a largo plazo en instrumentos de patrimonio',
  '260': 'Fianzas constituidas a largo plazo',
  '280': 'Amortización acumulada del inmovilizado intangible',
  '281': 'Amortización acumulada del inmovilizado material',
  '300': 'Mercaderías',
  '310': 'Materias primas',
  '320': 'Elementos y conjuntos incorporables',
  '350': 'Productos terminados',
  '400': 'Proveedores',
  '401': 'Proveedores, efectos comerciales a pagar',
  '406': 'Envases y embalajes a devolver a proveedores',
  '407': 'Anticipos a proveedores',
  '410': 'Acreedores por prestaciones de servicios',
  '430': 'Clientes',
  '431': 'Clientes, efectos comerciales a cobrar',
  '437': 'Envases y embalajes a devolver por clientes',
  '438': 'Anticipos de clientes',
  '440': 'Deudores',
  '460': 'Anticipos de remuneraciones',
  '465': 'Remuneraciones pendientes de pago',
  '470': 'Hacienda Pública, deudor por diversos conceptos',
  '472': 'Hacienda Pública, IVA soportado',
  '473': 'Hacienda Pública, retenciones y pagos a cuenta',
  '474': 'Activos por impuesto diferido',
  '475': 'Hacienda Pública, acreedor por diversos conceptos',
  '476': 'Organismos de la Seguridad Social, acreedores',
  '477': 'Hacienda Pública, IVA repercutido',
  '480': 'Gastos anticipados',
  '485': 'Ingresos anticipados',
  '520': 'Deudas a corto plazo con entidades de crédito',
  '521': 'Deudas a corto plazo',
  '540': 'Inversiones financieras a corto plazo en instrumentos de patrimonio',
  '550': 'Titular de la explotación',
  '551': 'Cuenta corriente con socios y administradores',
  '555': 'Partidas pendientes de aplicación',
  '557': 'Dividendo activo a cuenta',
  '570': 'Caja, euros',
  '572': 'Bancos e instituciones de crédito c/c vista, euros',
  '600': 'Compras de mercaderías',
  '621': 'Arrendamientos y cánones',
  '628': 'Suministros',
  '640': 'Sueldos y salarios',
  '700': 'Ventas de mercaderías',
  '705': 'Prestaciones de servicios',
};

const INITIAL_BALANCE: BalanceState = {
  assets: {
    nonCurrent: [
      { name: 'Terrenos y bienes naturales', amount: 75000, code: '210' },
      { name: 'Construcciones', amount: 150000, code: '211' }
    ],
    current: [{ name: 'Bancos', amount: 10000, code: '572' }]
  },
  liabilitiesAndEquity: {
    equity: [{ name: 'Capital Social', amount: 10000, code: '100' }],
    nonCurrent: [{ name: 'Deudas a largo plazo con entidades de crédito', amount: 200000, code: '170' }],
    current: [{ name: 'Préstamos a corto plazo de entidades de crédito', amount: 25000, code: '5200' }]
  }
};

const categorizeAccount = (code: string): { section: 'assets' | 'liabilitiesAndEquity', subSection: 'nonCurrent' | 'current' | 'equity' } | null => {
  if (!code) return null;
  const prefix1 = code.substring(0, 1);
  const prefix2 = code.substring(0, 2);
  const prefix3 = code.substring(0, 3);
  const prefix4 = code.substring(0, 4);

  // --- Grupo 1: Financiación Básica ---
  if (prefix2 === '10' || prefix2 === '11' || prefix2 === '12' || prefix2 === '13') return { section: 'liabilitiesAndEquity', subSection: 'equity' };
  if (prefix2 === '14' || prefix2 === '15' || prefix2 === '16' || prefix2 === '17' || prefix2 === '18') return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
  if (prefix2 === '19') return { section: 'liabilitiesAndEquity', subSection: 'current' };

  // --- Grupo 2: Activo No Corriente ---
  if (prefix1 === '2') {
    if (prefix3 === '280' || prefix3 === '281' || prefix3 === '282' || prefix2 === '29') return { section: 'assets', subSection: 'nonCurrent' };
    return { section: 'assets', subSection: 'nonCurrent' };
  }

  // --- Grupo 3: Existencias ---
  if (prefix1 === '3') return { section: 'assets', subSection: 'current' };

  // --- Grupo 4: Acreedores y Deudores ---
  if (prefix2 === '40') {
    if (prefix3 === '407') return { section: 'assets', subSection: 'current' }; // Anticipos a proveedores
    return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }
  if (prefix2 === '41') return { section: 'liabilitiesAndEquity', subSection: 'current' };
  if (prefix2 === '43') {
    if (prefix3 === '438') return { section: 'liabilitiesAndEquity', subSection: 'current' }; // Anticipos de clientes
    return { section: 'assets', subSection: 'current' };
  }
  if (prefix2 === '44') return { section: 'assets', subSection: 'current' };
  if (prefix2 === '46') {
    if (prefix3 === '460') return { section: 'assets', subSection: 'current' };
    return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }
  if (prefix2 === '47') {
    if (prefix3 === '470' || prefix3 === '471' || prefix3 === '472' || prefix3 === '473') return { section: 'assets', subSection: 'current' };
    if (prefix3 === '474') return { section: 'assets', subSection: 'nonCurrent' };
    if (prefix3 === '475' || prefix3 === '476' || prefix3 === '477') return { section: 'liabilitiesAndEquity', subSection: 'current' };
    if (prefix3 === '479') return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
  }
  if (prefix2 === '48') {
    if (prefix3 === '480') return { section: 'assets', subSection: 'current' };
    if (prefix3 === '485') return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }
  if (prefix2 === '49') {
    if (prefix3 === '490' || prefix3 === '493') return { section: 'assets', subSection: 'current' };
    return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }

  // --- Grupo 5: Cuentas Financieras ---
  if (prefix2 === '50' || prefix2 === '51' || prefix2 === '52') return { section: 'liabilitiesAndEquity', subSection: 'current' };
  if (prefix2 === '53' || prefix2 === '54') {
    if (prefix3 === '539' || prefix3 === '549') return { section: 'assets', subSection: 'current' };
    return { section: 'assets', subSection: 'current' };
  }
  if (prefix3 === '550') return { section: 'liabilitiesAndEquity', subSection: 'equity' };
  if (prefix3 === '551' || prefix3 === '552') return { section: 'assets', subSection: 'current' }; // Simplified, can be both
  if (prefix3 === '555' || prefix3 === '556') return { section: 'liabilitiesAndEquity', subSection: 'current' };
  if (prefix3 === '557') return { section: 'liabilitiesAndEquity', subSection: 'equity' };
  if (prefix4 === '5580') return { section: 'assets', subSection: 'current' };
  if (prefix4 === '5585') return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
  if (prefix2 === '55') {
    if (prefix4 === '5590' || prefix4 === '5593') return { section: 'assets', subSection: 'current' };
    if (prefix4 === '5595' || prefix4 === '5598') return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }
  if (prefix2 === '56') {
    if (prefix3 === '565' || prefix3 === '566' || prefix3 === '567') return { section: 'assets', subSection: 'current' };
    return { section: 'liabilitiesAndEquity', subSection: 'current' };
  }
  if (prefix2 === '57' || prefix2 === '58') {
    if (prefix3 === '585' || prefix3 === '586' || prefix3 === '587' || prefix3 === '588' || prefix3 === '589') return { section: 'liabilitiesAndEquity', subSection: 'current' };
    return { section: 'assets', subSection: 'current' };
  }
  if (prefix1 === '5') return { section: 'assets', subSection: 'current' };

  // Gastos e Ingresos: Grupo 6 y 7 -> Resultado del ejercicio (129) en Patrimonio Neto
  if (prefix1 === '6' || prefix1 === '7') {
    return { section: 'liabilitiesAndEquity', subSection: 'equity' };
  }

  return null;
};

const getUpdatedBalance = (currentBalance: BalanceState, row: AccountDraft): { nextBalance: BalanceState, targetId: string, targetName: string, amount: number } => {
  const debe = parseFloat(row.debe) || 0;
  const haber = parseFloat(row.haber) || 0;
  const code = row.code;
  
  const category = categorizeAccount(code);
  const nextBalance = JSON.parse(JSON.stringify(currentBalance));
  
  let targetId = '';
  let targetName = row.account;
  let targetCode = code;
  let amount = 0;

  if (category) {
    const isAsset = category.section === 'assets';
    amount = isAsset ? (debe - haber) : (haber - debe);
    
    const isPnL = code.startsWith('6') || code.startsWith('7');
    targetCode = isPnL ? '129' : code;
    targetName = isPnL ? 'Resultado del ejercicio' : row.account;

    if (isAsset) {
      targetId = category.subSection === 'nonCurrent' ? 'section-assets-noncurrent-pizarra' : 'section-assets-current-pizarra';
      const list = category.subSection === 'nonCurrent' ? nextBalance.assets.nonCurrent : nextBalance.assets.current;
      const existing = list.find((a: any) => a.code === targetCode);
      if (existing) existing.amount += amount;
      else list.push({ name: targetName, amount, code: targetCode });
    } else {
      if (category.subSection === 'equity') targetId = 'section-equity-pizarra';
      else if (category.subSection === 'nonCurrent') targetId = 'section-liabilities-noncurrent-pizarra';
      else targetId = 'section-liabilities-current-pizarra';
      
      const list = category.subSection === 'equity' ? nextBalance.liabilitiesAndEquity.equity : 
                   category.subSection === 'nonCurrent' ? nextBalance.liabilitiesAndEquity.nonCurrent : 
                   nextBalance.liabilitiesAndEquity.current;
      
      const existing = list.find((a: any) => a.code === targetCode);
      if (existing) existing.amount += amount;
      else list.push({ name: targetName, amount, code: targetCode });
    }
  } else {
    amount = debe - haber;
    targetId = 'section-assets-current-pizarra';
    const existing = nextBalance.assets.current.find((a: any) => a.name === row.account);
    if (existing) existing.amount += amount;
    else nextBalance.assets.current.push({ name: row.account, amount, code });
  }

  return { nextBalance, targetId, targetName, amount };
};

const reorganizeBalance = (balance: BalanceState): BalanceState => {
  const newBalance: BalanceState = {
    assets: { nonCurrent: [], current: [] },
    liabilitiesAndEquity: { equity: [], nonCurrent: [], current: [] }
  };

  const allItems: BalanceItem[] = [
    ...balance.assets.nonCurrent,
    ...balance.assets.current,
    ...balance.liabilitiesAndEquity.equity,
    ...balance.liabilitiesAndEquity.nonCurrent,
    ...balance.liabilitiesAndEquity.current
  ];

  // Use a Map to merge duplicates by code
  const mergedItems = new Map<string, BalanceItem>();
  allItems.forEach(item => {
    if (!item.code) return;
    
    // Map 6xx and 7xx to 129 for Balance Sheet representation
    const isPnL = item.code.startsWith('6') || item.code.startsWith('7');
    const targetCode = isPnL ? '129' : item.code;
    const targetName = isPnL ? 'Resultado del ejercicio' : item.name;

    if (mergedItems.has(targetCode)) {
      const existing = mergedItems.get(targetCode)!;
      // For PnL accounts, the amount in the balance data from AI might be signed differently
      // But usually AI sends it as a net contribution to Equity.
      existing.amount += item.amount;
    } else {
      mergedItems.set(targetCode, { ...item, code: targetCode, name: targetName });
    }
  });

  mergedItems.forEach(item => {
    const category = categorizeAccount(item.code);
    if (category) {
      if (category.section === 'assets') {
        if (category.subSection === 'nonCurrent') newBalance.assets.nonCurrent.push(item);
        else newBalance.assets.current.push(item);
      } else {
        if (category.subSection === 'equity') newBalance.liabilitiesAndEquity.equity.push(item);
        else if (category.subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent.push(item);
        else newBalance.liabilitiesAndEquity.current.push(item);
      }
    } else {
      // Default fallback
      newBalance.assets.current.push(item);
    }
  });

  return newBalance;
};

const SYSTEM_INSTRUCTION = `Eres un Tutor Inteligente de Contabilidad experto en el Plan General Contable (PGC). Tu objetivo es ayudar a estudiantes a comprender la lógica de los asientos contables y la partida doble.

REGLAS CRÍTICAS DE PEDAGOGÍA Y FLUJO (PROCEDIMIENTO OBLIGATORIO POR CADA CUENTA):
Para cada cuenta que deba intervenir en el asiento, debes seguir este orden ESTRICTO de preguntas:

1.º PREGUNTA POR LA CUENTA: Pregunta qué cuenta recoge el elemento en cuestión (ej: fruta, furgoneta, IVA, pago con tarjeta, etc). 
   - SI EL ALUMNO SE EQUIVOCA: Explícale qué recoge la cuenta que ha dicho erróneamente, aunque se haya acercado mucho.
   - NO pases al siguiente paso hasta que el alumno acierte el nombre y código de la cuenta.
   - NO añadas nada al diario ni cambies el balance aún.

2.º PREGUNTA POR EL LADO (DEBE/HABER): Una vez acertada la cuenta, pregunta si se carga (Debe) o se abona (Haber).
   - NO pases al siguiente paso hasta que el alumno acierte.
   - NO añadas nada al diario ni cambies el balance aún.

3.º PREGUNTA POR EL IMPORTE: Una vez acertado el lado, pregunta por el importe exacto.
   - NO pases al siguiente paso hasta que el alumno acierte.
   - NO añadas nada al diario ni cambies el balance aún.

4.º CONTABILIZACIÓN Y REFLEJO VISUAL: Solo cuando el alumno haya acertado los 3 puntos anteriores para esa cuenta específica:
   - Añade la cuenta con su importe al bloque [JOURNAL_DATA].
   - Actualiza el bloque [BALANCE_DATA] con el nuevo estado que refleja ese cambio.
   - SI EL ELEMENTO NO EXISTÍA EN EL BALANCE (ej: vende algo que no tiene): Refleja la disminución igualmente en [BALANCE_DATA], lo que resultará en un importe negativo.
   - Informa al alumno de que la cuenta ha sido contabilizada y procede con la siguiente cuenta del asiento siguiendo el mismo proceso 1-2-3-4.

REGLAS ADICIONALES:
- ELEMENTOS NO PRESENTES: Si el alumno propone un enunciado con elementos que no están en el balance, dale pistas para responder a las preguntas 1, 2 y 3.
- MÉTODO SOCRÁTICO: Plantea ÚNICAMENTE UNA PREGUNTA a la vez.
- NUNCA proporciones el asiento completo ni adelantes información.
- RESPUESTA RÁPIDA: Sé extremadamente conciso. Evita introducciones largas.

FORMATO TÉCNICO OBLIGATORIO:
Incluye siempre los bloques JSON al final. Si una cuenta aún no ha completado los 4 pasos, NO la incluyas en [JOURNAL_DATA] y NO modifiques [BALANCE_DATA].

[BALANCE_DATA]
{
  "assets": { "nonCurrent": [], "current": [] },
  "liabilitiesAndEquity": { "equity": [], "nonCurrent": [], "current": [] }
}
[/BALANCE_DATA]

[JOURNAL_DATA]
[
  {"account": "572 Bancos", "debe": 1000, "haber": 0}
]
[/JOURNAL_DATA]`;

// --- Components ---
const FlyingAccount = ({ name, amount, targetId, onComplete }: { 
  name: string; 
  amount: number; 
  targetId: string; 
  onComplete: () => void 
}) => {
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    setStartPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [targetId, onComplete]);

  return (
    <motion.div
      initial={{ x: startPos.x - 100, y: startPos.y, opacity: 0, scale: 0.5 }}
      animate={{ 
        x: [startPos.x - 100, startPos.x, targetPos.x], 
        y: [startPos.y, startPos.y, targetPos.y], 
        opacity: [0, 1, 0], 
        scale: [0.5, 1.1, 0.4] 
      }}
      transition={{ 
        duration: 1.5, 
        times: [0, 0.2, 1],
        ease: "easeInOut" 
      }}
      className="fixed z-[100] pointer-events-none app-content"
    >
      <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black flex flex-col items-center gap-1 border-2 border-white/20 backdrop-blur-sm">
        <span className="text-xs uppercase tracking-widest opacity-80">Contabilizando...</span>
        <div className="flex items-center gap-3">
          <span className="text-lg">{name}</span>
          <span className="bg-white/20 px-3 py-1 rounded-xl text-sm">
            {amount > 0 ? '+' : ''}{formatCurrency(amount)}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const AnimatedNumber = ({ value, duration = 5 }: { value: number, duration?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);
  
  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = prevValueRef.current;
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const current = progress * (value - startValue) + startValue;
      setDisplayValue(current);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        prevValueRef.current = value;
      }
    };
    
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{formatCurrency(displayValue)}</span>;
};

const BalanceRow = ({ item }: { item: BalanceItem, key?: React.Key }) => {
  const isNegative = item.amount < 0;
  
  // Check if account is a contra-account or allowed to be negative in PGC
  const isContraAccount = (code: string) => {
    if (!code) return false;
    
    // Grupo 1
    if (code.startsWith('103') || code.startsWith('104') || code.startsWith('108') || code.startsWith('109')) return true;
    if (code.startsWith('121')) return true;
    if (code.startsWith('153') || code.startsWith('154')) return true;
    if (code.startsWith('190') || code.startsWith('192') || code.startsWith('195') || code.startsWith('197')) return true;
    
    // Grupo 2
    if (code.startsWith('249') || code.startsWith('259')) return true;
    if (code.startsWith('28')) return true;
    if (code.startsWith('29')) return true;
    
    // Grupo 3
    if (code.startsWith('39')) return true;
    
    // Grupo 4
    if (code.startsWith('406')) return true;
    if (code.startsWith('437')) return true;
    if (code.startsWith('490') || code.startsWith('493')) return true;
    
    // Grupo 5
    if (code.startsWith('539') || code.startsWith('549')) return true;
    if (code.startsWith('557')) return true;
    if (code.startsWith('5585')) return true;
    if (code.startsWith('59')) return true;

    // Result for the year (129) can be negative if loss
    if (code.startsWith('129')) return true;
    
    return false;
  };

  const showError = isNegative && !isContraAccount(item.code || '');
  const [showExplanation, setShowExplanation] = useState(false);
  
  return (
    <div className="flex flex-col gap-1">
      <motion.div 
        layout 
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className={`flex justify-between items-center text-[14px] py-0.5 px-2 rounded-lg border transition-colors ${
          showError 
            ? 'bg-red-50 border-red-200 text-red-600' 
            : 'bg-zinc-50 border-zinc-100 text-zinc-600'
        }`}
      >
        <span className="font-medium leading-tight">
          <span className={`text-[9px] opacity-40 mr-1 ${showError ? 'text-red-400' : ''}`}>{item.code}</span> 
          {item.name}
        </span>
        <span className={`font-bold whitespace-nowrap ml-2 ${showError ? 'text-red-700' : 'text-zinc-900'}`}>
          <AnimatedNumber value={item.amount} />
        </span>
      </motion.div>
      {showError && (
        <div className="space-y-1">
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="px-2 py-1 bg-red-100 border border-red-200 rounded-md flex items-center justify-between gap-1.5"
          >
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-[9px] text-red-800 font-medium leading-tight">
                Por la propia naturaleza de la cuenta no es posible esta situación.
              </p>
            </div>
            <button 
              onClick={() => setShowExplanation(!showExplanation)}
              className="text-[9px] font-bold text-red-700 hover:underline flex-shrink-0 ml-1"
            >
              ¿Por qué?
            </button>
          </motion.div>
          
          <AnimatePresence>
            {showExplanation && (
              <motion.div
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -5, height: 0 }}
                className="px-3 py-2 bg-white border border-red-200 rounded-md shadow-sm"
              >
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Contablemente, una cuenta no puede reflejar una cantidad negativa de un bien físico o un derecho. Si esto ocurre, suele deberse a un error en el registro de las existencias iniciales o a una operación (como una venta o pago) de algo que no consta previamente en el patrimonio de la empresa.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const BalanceSectionEditor = ({ title, items, onAdd, onRemove, onUpdate, validationErrors }: { 
  title: string, 
  items: BalanceItem[], 
  onAdd: () => void, 
  onRemove: (idx: number) => void,
  onUpdate: (idx: number, field: keyof BalanceItem, value: any) => void,
  validationErrors?: { idx: number, fields: string[] }[]
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{title}</h4>
      <button onClick={onAdd} className="p-1 hover:bg-zinc-100 rounded-md text-emerald-600 transition-colors">
        <Plus className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-2">
      {items.map((item, idx) => {
        const errors = validationErrors?.find(e => e.idx === idx)?.fields || [];
        return (
          <div key={idx} className="flex gap-2 items-center">
            <input 
              type="text" 
              placeholder="Cód." 
              value={item.code} 
              onChange={(e) => onUpdate(idx, 'code', e.target.value)}
              className={`w-12 text-[10px] p-1 border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none ${errors.includes('code') ? 'border-red-500 bg-red-50' : 'border-zinc-200'}`}
            />
            <input 
              type="text" 
              placeholder="Nombre de la cuenta" 
              value={item.name} 
              onChange={(e) => onUpdate(idx, 'name', e.target.value)}
              className={`flex-1 text-[11px] p-1 border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none ${errors.includes('name') ? 'border-red-500 bg-red-50' : 'border-zinc-200'}`}
            />
            <input 
              type="number" 
              placeholder="Importe" 
              value={item.amount || ''} 
              onChange={(e) => onUpdate(idx, 'amount', e.target.value)}
              className={`w-20 text-[11px] p-1 border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none font-bold ${errors.includes('amount') ? 'border-red-500 bg-red-50' : 'border-zinc-200'}`}
            />
            <button onClick={() => onRemove(idx)} className="p-1 text-zinc-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-[10px] text-zinc-300 italic py-2">No hay elementos</p>}
    </div>
  </div>
);


export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      text: '¡Hola! Soy tu tutor de contabilidad. He preparado un balance inicial más completo para hoy: contamos con Terrenos (75.000€), Construcciones (150.000€) y 10.000€ en el Banco. Esto se financia con Capital Social (10.000€) y deudas con entidades de crédito a largo (200.000€) y corto plazo (25.000€). ¿En qué operación te gustaría trabajar hoy?',
      timestamp: new Date(),
      balance: INITIAL_BALANCE
    }
  ]);
  const [currentBalance, setCurrentBalance] = useState<BalanceState>(INITIAL_BALANCE);
  const [targetBalance, setTargetBalance] = useState<BalanceState>(INITIAL_BALANCE);
  const [currentJournal, setCurrentJournal] = useState<JournalEntry[][]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isPizarraMode, setIsPizarraMode] = useState(false);
  const [pizarraColumns, setPizarraColumns] = useState<1 | 2>(2);
  const [pizarraSplit, setPizarraSplit] = useState(50); // Percentage for balance column
  const [balanceFontScale, setBalanceFontScale] = useState(100);
  const [journalFontScale, setJournalFontScale] = useState(100);
  const [draftDate, setDraftDate] = useState('');
  const [draft, setDraft] = useState<AccountDraft[]>([
    { code: '', account: '', debe: '', haber: '' }
  ]);
  const [flyingAccount, setFlyingAccount] = useState<{
    id: string;
    name: string;
    amount: number;
    targetId: string;
    nextBalance: BalanceState;
  } | null>(null);
  
  const [isJournalFullscreen, setIsJournalFullscreen] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'app' | 'repasar'>('home');
  const [showToast, setShowToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [fontScale, setFontScale] = useState(100);

  // Game states
  const [gameScore, setGameScore] = useState(0);
  const [gameLives, setGameLives] = useState(5);
  const [gameSelectedModules, setGameSelectedModules] = useState<number[]>([]);
  const [gameStatus, setGameStatus] = useState<'selection' | 'playing' | 'gameover'>('selection');
  const [gameQuestionType, setGameQuestionType] = useState<'code' | 'balance'>('code');
  const [gameDifficulty, setGameDifficulty] = useState<'facil' | 'normal' | 'extremo'>('normal');
  const [gameTimer, setGameTimer] = useState(20);
  const [currentQuestion, setCurrentQuestion] = useState<{ code: string, name: string, examples?: string[] } | null>(null);
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedBalances, setSelectedBalances] = useState<string[]>([]);
  const [gameHistory, setGameHistory] = useState<{ score: number, date: string, timestamp: number, modules: number[], name?: string }[]>([]);
  const [gameSortCriteria, setGameSortCriteria] = useState<'date' | 'score'>('date');
  const [gameSortDirection, setGameSortDirection] = useState<'asc' | 'desc'>('desc');
  const [askedQuestionCodes, setAskedQuestionCodes] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [isScoreSaved, setIsScoreSaved] = useState(false);
  const [editingHistoryIndex, setEditingHistoryIndex] = useState<number | null>(null);
  const [editingHistoryName, setEditingHistoryName] = useState('');
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pizarraContainerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !pizarraContainerRef.current) return;
      const containerRect = pizarraContainerRef.current.getBoundingClientRect();
      const newSplit = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      if (newSplit > 20 && newSplit < 80) {
        setPizarraSplit(newSplit);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const saveSession = (silent = false) => {
    const sessionData = {
      messages,
      currentBalance,
      currentJournal,
      fontScale,
      balanceFontScale,
      journalFontScale,
      pizarraColumns,
      pizarraSplit,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('contaia_session', JSON.stringify(sessionData));
    if (!silent) {
      setShowToast({ message: 'Progreso guardado correctamente', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const loadSession = (silent = false) => {
    const saved = localStorage.getItem('contaia_session');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const loadedMessages = data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(loadedMessages);
        setCurrentBalance(data.currentBalance);
        setTargetBalance(data.currentBalance);
        setCurrentJournal(data.currentJournal);
        if (data.fontScale) setFontScale(data.fontScale);
        if (data.balanceFontScale) setBalanceFontScale(data.balanceFontScale);
        if (data.journalFontScale) setJournalFontScale(data.journalFontScale);
        if (data.pizarraColumns) setPizarraColumns(data.pizarraColumns);
        if (data.pizarraSplit) setPizarraSplit(data.pizarraSplit);
        if (!silent) {
          setShowToast({ message: 'Progreso cargado correctamente', type: 'success' });
          setTimeout(() => setShowToast(null), 3000);
        }
      } catch (e) {
        console.error("Error loading session", e);
        if (!silent) {
          setShowToast({ message: 'Error al cargar el progreso', type: 'error' });
          setTimeout(() => setShowToast(null), 3000);
        }
      }
    } else if (!silent) {
      setShowToast({ message: 'No hay progreso guardado', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const resetSession = () => {
    localStorage.removeItem('contaia_session');
    setMessages([
      {
        id: '1',
        role: 'bot',
        text: '¡Hola! Soy tu tutor de contabilidad. He preparado un balance inicial más completo para hoy: contamos con Terrenos (75.000€), Construcciones (150.000€) y 10.000€ en el Banco. Esto se financia con Capital Social (10.000€) y deudas con entidades de crédito a largo (200.000€) y corto plazo (25.000€). ¿En qué operación te gustaría trabajar hoy?',
        timestamp: new Date(),
        balance: INITIAL_BALANCE
      }
    ]);
    setCurrentBalance(INITIAL_BALANCE);
    setTargetBalance(INITIAL_BALANCE);
    setCurrentJournal([]);
    setFontScale(100);
    setBalanceFontScale(100);
    setJournalFontScale(100);
    setPizarraColumns(2);
    setPizarraSplit(50);
    setShowResetConfirm(false);
    setShowToast({ message: 'Sesión reiniciada', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  // Auto-load on mount
  useEffect(() => {
    loadSession(true);
  }, []);

  // Auto-save on changes
  useEffect(() => {
    // Skip initial save if messages is just the default one and nothing else changed
    if (messages.length === 1 && currentJournal.length === 0 && JSON.stringify(currentBalance) === JSON.stringify(INITIAL_BALANCE)) {
      return;
    }
    const timer = setTimeout(() => {
      saveSession(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, currentBalance, currentJournal, fontScale, balanceFontScale, journalFontScale, pizarraColumns, pizarraSplit]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const parseAIResponse = (text: string): { cleanText: string, balance?: BalanceState, journal?: JournalEntry[] } => {
    const balanceMatch = text.match(/\[BALANCE_DATA\]([\s\S]*?)\[\/BALANCE_DATA\]/);
    const journalMatch = text.match(/\[JOURNAL_DATA\]([\s\S]*?)\[\/JOURNAL_DATA\]/);
    
    let balance: BalanceState | undefined;
    let journal: JournalEntry[] | undefined;
    let cleanText = text;

    if (balanceMatch) {
      try {
        const rawBalance = JSON.parse(balanceMatch[1].trim());
        balance = reorganizeBalance(rawBalance);
        cleanText = cleanText.replace(/\[BALANCE_DATA\][\s\S]*?\[\/BALANCE_DATA\]/, '');
      } catch (e) { console.error("Balance parse error", e); }
    }

    if (journalMatch) {
      try {
        const rawJournal = JSON.parse(journalMatch[1].trim());
        // Extract code from account string if it starts with digits
        journal = rawJournal.map((entry: any) => {
          if (!entry.code && entry.account) {
            const match = entry.account.match(/^(\d+)\s+(.*)$/);
            if (match) {
              return { ...entry, code: match[1], account: match[2] };
            }
          }
          return entry;
        });
        cleanText = cleanText.replace(/\[JOURNAL_DATA\][\s\S]*?\[\/JOURNAL_DATA\]/, '');
      } catch (e) { console.error("Journal parse error", e); }
    }

    return { cleanText: cleanText.trim(), balance, journal };
  };

  const findBalanceDifference = (oldB: BalanceState, newB: BalanceState) => {
    const sections = [
      { key: 'assets' as const, sub: ['nonCurrent', 'current'] as const },
      { key: 'liabilitiesAndEquity' as const, sub: ['equity', 'nonCurrent', 'current'] as const }
    ];

    for (const s of sections) {
      for (const sub of s.sub) {
        const oldList = (oldB[s.key] as any)[sub] as BalanceItem[];
        const newList = (newB[s.key] as any)[sub] as BalanceItem[];

        for (const newItem of newList) {
          const oldItem = oldList.find(i => i.code === newItem.code);
          const diff = newItem.amount - (oldItem?.amount || 0);
          if (Math.abs(diff) > 0.01) {
            let targetId = `section-${s.key === 'assets' ? 'assets' : 'liabilities'}-${sub.toLowerCase()}`;
            if (sub === 'equity') targetId = 'section-equity';
            return { name: newItem.name, amount: diff, targetId };
          }
        }
        
        for (const oldItem of oldList) {
          const newItem = newList.find(i => i.code === oldItem.code);
          if (!newItem && Math.abs(oldItem.amount) > 0.01) {
             let targetId = `section-${s.key === 'assets' ? 'assets' : 'liabilities'}-${sub.toLowerCase()}`;
             if (sub === 'equity') targetId = 'section-equity';
             return { name: oldItem.name, amount: -oldItem.amount, targetId };
          }
        }
      }
    }
    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const model = "gemini-3-flash-preview";
      
      const history = messages.map(m => ({
        role: m.role === 'bot' ? 'model' : 'user',
        parts: [{ text: m.text + 
          (m.balance ? `\n[BALANCE_DATA]${JSON.stringify(m.balance)}[/BALANCE_DATA]` : '') +
          (m.journal ? `\n[JOURNAL_DATA]${JSON.stringify(m.journal)}[/JOURNAL_DATA]` : '')
        }]
      }));

      const stream = await ai.models.generateContentStream({
        model,
        contents: [
          ...history,
          { role: 'user', parts: [{ text: input }] }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      let fullText = '';
      const botMessageId = (Date.now() + 1).toString();
      
      // Create an initial empty bot message
      setMessages(prev => [...prev, {
        id: botMessageId,
        role: 'bot',
        text: '',
        timestamp: new Date(),
      }]);

      for await (const chunk of stream) {
        fullText += chunk.text;
        setMessages(prev => prev.map(m => 
          m.id === botMessageId ? { ...m, text: fullText } : m
        ));
      }

      const { cleanText, balance, journal } = parseAIResponse(fullText);
      
      if (balance) {
        setTargetBalance(balance);
        const diff = findBalanceDifference(currentBalance, balance);
        if (diff) {
          setFlyingAccount({
            id: Date.now().toString(),
            name: diff.name,
            amount: diff.amount,
            targetId: diff.targetId,
            nextBalance: balance
          });
        } else {
          setCurrentBalance(balance);
        }
      }
      
      if (journal && journal.length > 0) {
        setCurrentJournal(prev => {
          if (prev.length === 0) return [journal];
          
          const lastEntry = prev[prev.length - 1];
          const lastTotalDebe = lastEntry.reduce((acc, r) => acc + r.debe, 0);
          const lastTotalHaber = lastEntry.reduce((acc, r) => acc + r.haber, 0);
          const isLastBalanced = Math.abs(lastTotalDebe - lastTotalHaber) < 0.01 && lastEntry.length > 0;

          const isContinuation = journal.length >= lastEntry.length && 
            lastEntry.every((row, i) => 
              row.account === journal[i].account && 
              row.debe === journal[i].debe && 
              row.haber === journal[i].haber
            );

          if (isContinuation) {
            const next = [...prev];
            next[next.length - 1] = journal;
            return next;
          } else if (isLastBalanced) {
            return [...prev, journal];
          } else {
            const next = [...prev];
            next[next.length - 1] = journal;
            return next;
          }
        });
      }

      // Update the final message with parsed data and clean text
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { 
          ...m, 
          text: cleanText || fullText,
          balance: balance,
          journal: journal
        } : m
      ));
    } catch (error) {
      console.error("Error calling Gemini:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        text: 'Ups, parece que hay un problema de conexión. Por favor, inténtalo de nuevo.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const addDraftRow = () => {
    setDraft([...draft, { code: '', account: '', debe: '', haber: '' }]);
  };

  const updateDraft = (index: number, field: keyof AccountDraft, value: string) => {
    const newDraft = [...draft];
    (newDraft[index][field] as any) = value;
    setDraft(newDraft);
  };

  const clearDraft = () => {
    setDraft([{ code: '', account: '', debe: '', haber: '' }]);
    setDraftDate('');
  };

  const applyManualEntry = () => {
    // Use draftDate entered in the top field
    const firstDate = draftDate.trim() || 'xx/xx/xx';
    
    // Format the date to dd/mm/aa if it's a valid date string, otherwise use what's entered or fallback
    let formattedDate = firstDate;
    if (firstDate !== 'xx/xx/xx') {
      const dateParts = firstDate.split(/[-/]/);
      if (dateParts.length === 3) {
        let day = dateParts[0];
        let month = dateParts[1];
        let year = dateParts[2];
        
        if (day.length === 4) {
          year = day;
          day = dateParts[2];
        }
        
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        if (year.length === 4) year = year.substring(2);
        else year = year.padStart(2, '0');
        
        formattedDate = `${day}/${month}/${year}`;
      }
    }

    const newJournalEntries: JournalEntry[] = draft
      .filter(d => d.account.trim() !== '' && (parseFloat(d.debe) > 0 || parseFloat(d.haber) > 0))
      .map(d => ({
        code: d.code,
        account: d.account,
        debe: parseFloat(d.debe) || 0,
        haber: parseFloat(d.haber) || 0,
        date: formattedDate
      }));

    if (newJournalEntries.length === 0) return;

    const totalDebe = newJournalEntries.reduce((acc, curr) => acc + curr.debe, 0);
    const totalHaber = newJournalEntries.reduce((acc, curr) => acc + curr.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      alert("El asiento no está cuadrado (Debe ≠ Haber)");
      return;
    }

    // Auto-reflect unreflected lines
    const unreflectedLines = draft.filter(d => !d.reflected && d.account.trim() !== '' && (parseFloat(d.debe) > 0 || parseFloat(d.haber) > 0));
    
    if (unreflectedLines.length > 0) {
      let nextBalance = JSON.parse(JSON.stringify(currentBalance));
      
      unreflectedLines.forEach(row => {
        const result = getUpdatedBalance(nextBalance, row);
        nextBalance = result.nextBalance;
      });
      
      setCurrentBalance(nextBalance);
    }

    setCurrentJournal(prev => [...prev, newJournalEntries]);
    clearDraft();
  };

  const reflectLine = (index: number) => {
    const row = draft[index];
    if (!row.account || (!parseFloat(row.debe) && !parseFloat(row.haber))) return;

    const { nextBalance, targetId, targetName, amount } = getUpdatedBalance(currentBalance, row);

    setFlyingAccount({
      id: Date.now().toString(),
      name: targetName,
      amount,
      targetId,
      nextBalance
    });

    const newDraft = [...draft];
    newDraft[index].reflected = true;
    setDraft(newDraft);
  };

  const totalAssets = 
    currentBalance.assets.nonCurrent.reduce((acc, item) => acc + item.amount, 0) +
    currentBalance.assets.current.reduce((acc, item) => acc + item.amount, 0);
    
  const totalLiabilities = 
    currentBalance.liabilitiesAndEquity.equity.reduce((acc, item) => acc + item.amount, 0) +
    currentBalance.liabilitiesAndEquity.nonCurrent.reduce((acc, item) => acc + item.amount, 0) +
    currentBalance.liabilitiesAndEquity.current.reduce((acc, item) => acc + item.amount, 0);

  const CustomizationModal = () => {
    const [tempBalance, setTempBalance] = useState<BalanceState>(JSON.parse(JSON.stringify(currentBalance)));

    const addItem = (section: string, subSection: string) => {
      const newBalance = { ...tempBalance };
      const newItem = { name: '', amount: 0, code: '' };
      
      if (section === 'assets') {
        if (subSection === 'nonCurrent') newBalance.assets.nonCurrent = [...newBalance.assets.nonCurrent, newItem];
        else newBalance.assets.current = [...newBalance.assets.current, newItem];
      } else {
        if (subSection === 'equity') newBalance.liabilitiesAndEquity.equity = [...newBalance.liabilitiesAndEquity.equity, newItem];
        else if (subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent = [...newBalance.liabilitiesAndEquity.nonCurrent, newItem];
        else newBalance.liabilitiesAndEquity.current = [...newBalance.liabilitiesAndEquity.current, newItem];
      }
      setTempBalance(newBalance);
    };

    const removeItem = (section: string, subSection: string, index: number) => {
      const newBalance = { ...tempBalance };
      if (section === 'assets') {
        if (subSection === 'nonCurrent') newBalance.assets.nonCurrent = newBalance.assets.nonCurrent.filter((_, i) => i !== index);
        else newBalance.assets.current = newBalance.assets.current.filter((_, i) => i !== index);
      } else {
        if (subSection === 'equity') newBalance.liabilitiesAndEquity.equity = newBalance.liabilitiesAndEquity.equity.filter((_, i) => i !== index);
        else if (subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent = newBalance.liabilitiesAndEquity.nonCurrent.filter((_, i) => i !== index);
        else newBalance.liabilitiesAndEquity.current = newBalance.liabilitiesAndEquity.current.filter((_, i) => i !== index);
      }
      setTempBalance(newBalance);
    };

    const updateItem = (section: string, subSection: string, index: number, field: keyof BalanceItem, value: any) => {
      const newBalance = { ...tempBalance };
      let list;
      if (section === 'assets') {
        list = subSection === 'nonCurrent' ? [...newBalance.assets.nonCurrent] : [...newBalance.assets.current];
      } else {
        if (subSection === 'equity') list = [...newBalance.liabilitiesAndEquity.equity];
        else if (subSection === 'nonCurrent') list = [...newBalance.liabilitiesAndEquity.nonCurrent];
        else list = [...newBalance.liabilitiesAndEquity.current];
      }
      
      const item = { ...list[index] };
      if (field === 'amount') item.amount = parseFloat(value) || 0;
      else if (field === 'name') item.name = value;
      else if (field === 'code') {
        item.code = value;
        // Auto-fill name if code matches mapping
        if (ACCOUNT_MAPPING[value] && !item.name) {
          item.name = ACCOUNT_MAPPING[value];
        }
        
        // REORGANIZATION LOGIC: If code changes and belongs to another section, move it
        const category = categorizeAccount(value);
        if (category && (category.section !== section || category.subSection !== subSection)) {
          // Remove from current list
          list.splice(index, 1);
          if (section === 'assets') {
            if (subSection === 'nonCurrent') newBalance.assets.nonCurrent = list;
            else newBalance.assets.current = list;
          } else {
            if (subSection === 'equity') newBalance.liabilitiesAndEquity.equity = list;
            else if (subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent = list;
            else newBalance.liabilitiesAndEquity.current = list;
          }

          // Add to new list
          if (category.section === 'assets') {
            if (category.subSection === 'nonCurrent') newBalance.assets.nonCurrent = [...newBalance.assets.nonCurrent, item];
            else newBalance.assets.current = [...newBalance.assets.current, item];
          } else {
            if (category.subSection === 'equity') newBalance.liabilitiesAndEquity.equity = [...newBalance.liabilitiesAndEquity.equity, item];
            else if (category.subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent = [...newBalance.liabilitiesAndEquity.nonCurrent, item];
            else newBalance.liabilitiesAndEquity.current = [...newBalance.liabilitiesAndEquity.current, item];
          }
          setTempBalance(newBalance);
          return; // Exit as we already updated state
        }
      }
      
      list[index] = item;
      
      if (section === 'assets') {
        if (subSection === 'nonCurrent') newBalance.assets.nonCurrent = list;
        else newBalance.assets.current = list;
      } else {
        if (subSection === 'equity') newBalance.liabilitiesAndEquity.equity = list;
        else if (subSection === 'nonCurrent') newBalance.liabilitiesAndEquity.nonCurrent = list;
        else newBalance.liabilitiesAndEquity.current = list;
      }
      
      setTempBalance(newBalance);
    };

    const tempTotalAssets = 
      tempBalance.assets.nonCurrent.reduce((acc, item) => acc + item.amount, 0) +
      tempBalance.assets.current.reduce((acc, item) => acc + item.amount, 0);
      
    const tempTotalLiabilities = 
      tempBalance.liabilitiesAndEquity.equity.reduce((acc, item) => acc + item.amount, 0) +
      tempBalance.liabilitiesAndEquity.nonCurrent.reduce((acc, item) => acc + item.amount, 0) +
      tempBalance.liabilitiesAndEquity.current.reduce((acc, item) => acc + item.amount, 0);

    const getValidationErrors = (items: BalanceItem[]) => {
      return items.map((item, idx) => {
        const fields = [];
        if (!item.code?.trim()) fields.push('code');
        if (!item.name?.trim()) fields.push('name');
        if (item.amount === 0 && item.name?.trim() === '') fields.push('amount'); // Basic check
        
        // Check mapping if both code and name are present
        if (item.code && item.name) {
          const expectedName = ACCOUNT_MAPPING[item.code];
          if (expectedName && !expectedName.toLowerCase().includes(item.name.toLowerCase()) && !item.name.toLowerCase().includes(expectedName.toLowerCase())) {
            if (!fields.includes('code')) fields.push('code');
            if (!fields.includes('name')) fields.push('name');
          }
        }
        
        return { idx, fields };
      }).filter(e => e.fields.length > 0);
    };

    const assetNonCurrentErrors = getValidationErrors(tempBalance.assets.nonCurrent);
    const assetCurrentErrors = getValidationErrors(tempBalance.assets.current);
    const equityErrors = getValidationErrors(tempBalance.liabilitiesAndEquity.equity);
    const liabilityNonCurrentErrors = getValidationErrors(tempBalance.liabilitiesAndEquity.nonCurrent);
    const liabilityCurrentErrors = getValidationErrors(tempBalance.liabilitiesAndEquity.current);

    const hasAnyFieldErrors = 
      assetNonCurrentErrors.length > 0 || 
      assetCurrentErrors.length > 0 || 
      equityErrors.length > 0 || 
      liabilityNonCurrentErrors.length > 0 || 
      liabilityCurrentErrors.length > 0;

    const hasMismatchError = 
      [...assetNonCurrentErrors, ...assetCurrentErrors, ...equityErrors, ...liabilityNonCurrentErrors, ...liabilityCurrentErrors]
      .some(e => e.fields.includes('code') && e.fields.includes('name'));

    const isUnbalanced = Math.abs(tempTotalAssets - tempTotalLiabilities) > 0.01;

    const handleSave = () => {
      if (hasAnyFieldErrors || isUnbalanced) return;
      setCurrentBalance(tempBalance);
      setTargetBalance(tempBalance);
      setMessages([{
        id: Date.now().toString(),
        role: 'bot',
        text: '¡Balance actualizado! He tomado nota de tu balance inicial personalizado. ¿Qué operación te gustaría realizar ahora?',
        timestamp: new Date(),
        balance: tempBalance
      }]);
      setCurrentJournal([]);
      setIsCustomizing(false);
    };

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden app-content"
        >
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <Settings className="text-white w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Personalizar Balance Inicial</h2>
                <p className="text-xs text-zinc-500">Configura las cuentas y saldos de partida</p>
              </div>
            </div>
            <button onClick={() => setIsCustomizing(false)} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
              <X className="w-6 h-6 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Assets Column */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b-2 border-emerald-500 pb-2">
                  <Calculator className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-black text-emerald-600 uppercase tracking-widest">Activo</h3>
                </div>
                <div className="space-y-8">
                  <BalanceSectionEditor 
                    title="Activo No Corriente" 
                    items={tempBalance.assets.nonCurrent} 
                    onAdd={() => addItem('assets', 'nonCurrent')}
                    onRemove={(idx) => removeItem('assets', 'nonCurrent', idx)}
                    onUpdate={(idx, f, v) => updateItem('assets', 'nonCurrent', idx, f, v)}
                    validationErrors={assetNonCurrentErrors}
                  />
                  <BalanceSectionEditor 
                    title="Activo Corriente" 
                    items={tempBalance.assets.current} 
                    onAdd={() => addItem('assets', 'current')}
                    onRemove={(idx) => removeItem('assets', 'current', idx)}
                    onUpdate={(idx, f, v) => updateItem('assets', 'current', idx, f, v)}
                    validationErrors={assetCurrentErrors}
                  />
                </div>
              </div>

              {/* Liabilities Column */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b-2 border-blue-500 pb-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-black text-blue-600 uppercase tracking-widest">Patrimonio Neto + Pasivo</h3>
                </div>
                <div className="space-y-8">
                  <BalanceSectionEditor 
                    title="Patrimonio Neto" 
                    items={tempBalance.liabilitiesAndEquity.equity} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'equity')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'equity', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'equity', idx, f, v)}
                    validationErrors={equityErrors}
                  />
                  <BalanceSectionEditor 
                    title="Pasivo No Corriente" 
                    items={tempBalance.liabilitiesAndEquity.nonCurrent} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'nonCurrent')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'nonCurrent', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'nonCurrent', idx, f, v)}
                    validationErrors={liabilityNonCurrentErrors}
                  />
                  <BalanceSectionEditor 
                    title="Pasivo Corriente" 
                    items={tempBalance.liabilitiesAndEquity.current} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'current')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'current', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'current', idx, f, v)}
                    validationErrors={liabilityCurrentErrors}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex flex-col gap-2">
                <div className="flex gap-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Activo</span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(tempTotalAssets)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Total P.N. + Pasivo</span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-blue-600'}`}>
                      {formatCurrency(tempTotalLiabilities)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Diferencia</span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(tempTotalAssets - tempTotalLiabilities)}
                    </span>
                  </div>
                </div>
                {isUnbalanced && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> El balance inicial debe estar cuadrado para poder guardar.
                  </p>
                )}
                {hasAnyFieldErrors && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Revisa los campos marcados en rojo (vacíos o con errores de código/nombre).
                  </p>
                )}
                {hasMismatchError && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> El número de cuenta y el nombre no coinciden según el PGC.
                  </p>
                )}
             </div>
             <div className="flex gap-3">
                <button 
                  onClick={() => setTempBalance({ assets: { nonCurrent: [], current: [] }, liabilitiesAndEquity: { equity: [], nonCurrent: [], current: [] } })}
                  className="px-4 py-2 text-zinc-500 font-bold hover:text-zinc-700 transition-colors text-sm"
                >
                  Empezar de cero
                </button>
                <button 
                  onClick={handleSave}
                  disabled={hasAnyFieldErrors || isUnbalanced}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95"
                >
                  Guardar balance final
                </button>
             </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const ResetConfirmModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-zinc-100"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">¿Reiniciar sesión?</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Esta acción borrará todos tus mensajes, asientos contables y el estado actual del balance. 
              <span className="block font-bold text-red-600 mt-1">No se puede deshacer.</span>
            </p>
          </div>
          <div className="flex gap-3 w-full mt-4">
            <button 
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-2xl font-bold transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={resetSession}
              className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-lg shadow-red-200 transition-all"
            >
              Sí, reiniciar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const getCorrectBalances = (code: string): string[] => {
    const firstDigit = code[0];
    const firstTwo = code.substring(0, 2);
    const firstThree = code.substring(0, 3);
    
    // Default: Nulo is always possible
    const results = ['Saldo nulo'];

    if (code === '129') {
      results.push('Saldo deudor', 'Saldo acreedor');
      return results;
    }

    if (['606', '608', '609'].includes(code)) {
      results.push('Saldo acreedor');
      return results;
    }

    if (['706', '708', '709'].includes(code)) {
      results.push('Saldo deudor');
      return results;
    }

    if (['610', '611', '612'].includes(code)) {
      results.push('Saldo deudor', 'Saldo acreedor');
      return results;
    }

    // Assets & Expenses
    const isDeudor = 
      firstDigit === '2' || 
      firstDigit === '3' || 
      firstDigit === '6' ||
      firstTwo === '43' && code !== '438' ||
      firstTwo === '44' ||
      firstThree === '470' ||
      firstThree === '472' ||
      firstThree === '473' ||
      code === '407' ||
      code === '406' ||
      firstTwo === '54' ||
      firstTwo === '55' ||
      firstTwo === '56' && code !== '560' ||
      firstTwo === '57' ||
      code === '103';

    // Liabilities, Equity & Income
    const isAcreedor = 
      firstDigit === '1' && code !== '103' && code !== '129' ||
      firstDigit === '7' ||
      firstTwo === '40' && code !== '407' && code !== '406' ||
      firstTwo === '41' ||
      code === '438' ||
      firstThree === '475' ||
      firstThree === '477' ||
      firstTwo === '52' ||
      code === '560';

    if (isDeudor) results.push('Saldo deudor');
    if (isAcreedor) results.push('Saldo acreedor');
    
    return results;
  };

  // Game logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStatus === 'playing' && gameTimer > 0 && lastAnswerCorrect === null) {
      interval = setInterval(() => {
        setGameTimer(prev => prev - 1);
      }, 1000);
    } else if (gameTimer === 0 && gameStatus === 'playing' && lastAnswerCorrect === null) {
      // Time's up
      handleWrongAnswer('¡Tiempo agotado!');
    }
    return () => clearInterval(interval);
  }, [gameStatus, gameTimer, lastAnswerCorrect]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('contabilidad_game_history');
    if (savedHistory) {
      setGameHistory(JSON.parse(savedHistory));
    }
  }, []);

  const saveScore = (score: number, name: string) => {
    const newEntry = {
      score,
      name: name || 'Anónimo',
      date: new Date().toLocaleString('es-ES'),
      timestamp: Date.now(),
      modules: gameSelectedModules
    };
    const updatedHistory = [newEntry, ...gameHistory].slice(0, 10);
    setGameHistory(updatedHistory);
    localStorage.setItem('contabilidad_game_history', JSON.stringify(updatedHistory));
    setIsScoreSaved(true);
  };

  const updateHistoryName = (index: number, newName: string) => {
    const updatedHistory = [...gameHistory];
    updatedHistory[index].name = newName || 'Anónimo';
    setGameHistory(updatedHistory);
    localStorage.setItem('contabilidad_game_history', JSON.stringify(updatedHistory));
    setEditingHistoryIndex(null);
  };

  const getAvailableAccounts = () => {
    const accounts: { code: string, name: string, examples?: string[] }[] = [];
    gameSelectedModules.forEach(m => {
      accounts.push(...MODULE_ACCOUNTS[m]);
    });
    // Remove duplicates
    return Array.from(new Map(accounts.map(item => [item.code, item])).values());
  };

  const generateQuestion = (currentAsked?: string[]) => {
    const accounts = getAvailableAccounts();
    if (accounts.length === 0) return;
    
    const asked = currentAsked !== undefined ? currentAsked : askedQuestionCodes;
    let availableAccounts = accounts.filter(a => !asked.includes(a.code));
    
    if (availableAccounts.length === 0) {
      availableAccounts = accounts;
      setAskedQuestionCodes([]);
    }
    
    const randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    setCurrentQuestion(randomAccount);
    setAskedQuestionCodes(prev => {
      if (availableAccounts.length === accounts.length && prev.length > 0) {
        return [randomAccount.code];
      }
      return [...prev, randomAccount.code];
    });
    
    setUserAnswer('');
    setSelectedBalances([]);
    setLastAnswerCorrect(null);
    
    const difficultyTimes = {
      facil: 30,
      normal: 20,
      extremo: 10
    };
    setGameTimer(difficultyTimes[gameDifficulty]);
    
    const type = Math.random() > 0.4 ? 'code' : 'balance';
    setGameQuestionType(type);

    // Pick question text
    if (type === 'code' && randomAccount.examples && randomAccount.examples.length > 0) {
      const example = randomAccount.examples[Math.floor(Math.random() * randomAccount.examples.length)];
      setCurrentQuestionText(example);
    } else {
      setCurrentQuestionText(randomAccount.name);
    }
  };

  const handleWrongAnswer = (message?: string) => {
    setGameLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setGameStatus('gameover');
        setPlayerName('');
        setIsScoreSaved(false);
      }
      return newLives;
    });
    setGameScore(prev => Math.max(0, prev - 5));
    setLastAnswerCorrect(false);
    if (message) {
      setShowToast({ message, type: 'error' });
    }
    setTimeout(() => {
      setLastAnswerCorrect(null);
      setUserAnswer('');
      setSelectedBalances([]);
      if (gameStatus === 'playing') {
        generateQuestion();
      }
    }, 1500);
  };

  const startGame = () => {
    if (gameSelectedModules.length === 0) {
      setShowToast({ message: "Selecciona al menos un módulo para empezar", type: 'error' });
      return;
    }
    setGameScore(0);
    setGameLives(5);
    setGameStatus('playing');
    setAskedQuestionCodes([]);
    generateQuestion([]);
  };

  const handleGameAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion) return;

    if (gameQuestionType === 'code') {
      if (userAnswer.trim() === currentQuestion.code) {
        setGameScore(prev => prev + 10);
        setLastAnswerCorrect(true);
        setTimeout(() => {
          generateQuestion();
        }, 1000);
      } else {
        handleWrongAnswer();
      }
    } else {
      const correct = getCorrectBalances(currentQuestion.code);
      const isCorrect = 
        selectedBalances.length === correct.length && 
        selectedBalances.every(b => correct.includes(b));

      if (isCorrect) {
        setGameScore(prev => prev + 15); // Bonus for balance questions
        setLastAnswerCorrect(true);
        setTimeout(() => {
          generateQuestion();
        }, 1000);
      } else {
        handleWrongAnswer();
      }
    }
  };

  if (currentView === 'repasar') {
    const sortedHistory = [...gameHistory].sort((a, b) => {
      let comparison = 0;
      if (gameSortCriteria === 'date') {
        comparison = (a.timestamp || 0) - (b.timestamp || 0);
      } else {
        comparison = a.score - b.score;
      }
      return gameSortDirection === 'asc' ? comparison : -comparison;
    });

    return (
      <div className="min-h-screen bg-zinc-50 font-sans p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentView('home')}
                className="p-2 bg-white rounded-xl shadow-sm border border-zinc-200 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-6 h-6 text-zinc-600" />
              </button>
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight uppercase">Repasar Cuentas</h2>
            </div>
            {gameStatus === 'playing' && (
              <div className="flex items-center gap-6">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className={`absolute inset-0 rounded-full blur-xl transition-all duration-500 ${
                    gameTimer <= 3 ? 'bg-red-500/20 opacity-100' : 'bg-emerald-500/10 opacity-0'
                  }`} />
                  <svg className="w-full h-full -rotate-90 drop-shadow-sm">
                    <circle 
                      cx="32" cy="32" r="28" 
                      fill="white" stroke="#F3F4F6" strokeWidth="6" 
                    />
                    <motion.circle 
                      cx="32" cy="32" r="28" 
                      fill="none" 
                      stroke={gameTimer <= 3 ? "#EF4444" : "#10B981"} 
                      strokeWidth="6" 
                      strokeDasharray="175.9"
                      animate={{ strokeDashoffset: 175.9 * (1 - gameTimer / (gameDifficulty === 'facil' ? 30 : gameDifficulty === 'normal' ? 20 : 10)) }}
                      transition={{ duration: 0.3, ease: "linear" }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`absolute font-black text-xl tabular-nums ${
                    gameTimer <= 3 ? 'text-red-600 animate-pulse scale-110' : 'text-zinc-700'
                  } transition-all duration-300`}>
                    {gameTimer}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="text-xl font-black text-zinc-900">{gameScore}</span>
                </div>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Heart 
                      key={i} 
                      className={`w-5 h-5 ${i < gameLives ? 'text-red-500 fill-red-500' : 'text-zinc-300'}`} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {gameStatus === 'selection' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid md:grid-cols-2 gap-8"
            >
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-zinc-100 space-y-6">
                <h3 className="text-xl font-bold text-zinc-900">Selecciona Módulos</h3>
                <div className="space-y-3">
                  {/* Master Option: Contabilidad Financiera I */}
                  <label 
                    className={`flex items-center justify-between p-4 pl-2 rounded-2xl border-2 cursor-pointer transition-all ${
                      gameSelectedModules.length === 4 
                        ? 'border-emerald-600 bg-emerald-100' 
                        : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                        gameSelectedModules.length === 4 ? 'bg-emerald-600 border-emerald-600' : 'border-zinc-300 bg-white'
                      }`}>
                        {gameSelectedModules.length === 4 && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <span className="font-black text-zinc-900 text-sm uppercase tracking-tight">Contabilidad Financiera I</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={gameSelectedModules.length === 4}
                      onChange={() => {
                        if (gameSelectedModules.length === 4) setGameSelectedModules([]);
                        else setGameSelectedModules([1, 2, 3, 5]);
                      }}
                    />
                  </label>

                  <div className="h-px bg-zinc-100 my-2" />

                  {[1, 2, 3, 5].map(m => (
                    <label 
                      key={m} 
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        gameSelectedModules.includes(m) 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : 'border-zinc-100 hover:border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                          gameSelectedModules.includes(m) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'
                        }`}>
                          {gameSelectedModules.includes(m) && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                        <span className="font-bold text-zinc-700">Módulo {m}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={gameSelectedModules.includes(m)}
                        onChange={() => {
                          setGameSelectedModules(prev => 
                            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
                          );
                        }}
                      />
                    </label>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-zinc-900">Dificultad</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(['facil', 'normal', 'extremo'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setGameDifficulty(d)}
                        className={`py-3 px-2 rounded-2xl border-2 font-bold text-xs uppercase tracking-wider transition-all ${
                          gameDifficulty === d
                            ? 'border-emerald-600 bg-emerald-100 text-emerald-700'
                            : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200'
                        }`}
                      >
                        {d === 'facil' ? 'Fácil (30s)' : d === 'normal' ? 'Normal (20s)' : 'Extremo (10s)'}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={startGame}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95"
                >
                  EMPEZAR JUEGO
                </button>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-zinc-100 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-zinc-400" />
                    <h3 className="text-xl font-bold text-zinc-900">Últimas Puntuaciones</h3>
                  </div>
                  {gameHistory.length > 0 && (
                    <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl">
                      <button 
                        onClick={() => {
                          if (gameSortCriteria === 'date') setGameSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          else { setGameSortCriteria('date'); setGameSortDirection('desc'); }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                          gameSortCriteria === 'date' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                        }`}
                      >
                        Fecha {gameSortCriteria === 'date' && (gameSortDirection === 'asc' ? '↑' : '↓')}
                      </button>
                      <button 
                        onClick={() => {
                          if (gameSortCriteria === 'score') setGameSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          else { setGameSortCriteria('score'); setGameSortDirection('desc'); }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                          gameSortCriteria === 'score' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                        }`}
                      >
                        Puntos {gameSortCriteria === 'score' && (gameSortDirection === 'asc' ? '↑' : '↓')}
                      </button>
                    </div>
                  )}
                </div>
                {gameHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400 space-y-2">
                    <Trophy className="w-12 h-12 opacity-20" />
                    <p className="font-medium">Aún no hay partidas</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedHistory.map((entry, i) => {
                      // Find original index in gameHistory for editing
                      const originalIndex = gameHistory.findIndex(h => h === entry);
                      return (
                        <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                          <div className="flex flex-col flex-grow mr-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              {editingHistoryIndex === originalIndex ? (
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <input 
                                    type="text"
                                    value={editingHistoryName}
                                    onChange={(e) => setEditingHistoryName(e.target.value)}
                                    className="text-sm font-black text-zinc-900 bg-white border border-zinc-200 rounded px-2 py-1 outline-none focus:border-emerald-500 min-w-0 flex-grow"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') updateHistoryName(originalIndex, editingHistoryName);
                                      if (e.key === 'Escape') setEditingHistoryIndex(null);
                                    }}
                                  />
                                  <button 
                                    onClick={() => updateHistoryName(originalIndex, editingHistoryName)}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => setEditingHistoryIndex(null)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group">
                                  <span className="text-sm font-black text-zinc-900">{entry.name || 'Anónimo'}</span>
                                  <button 
                                    onClick={() => {
                                      setEditingHistoryIndex(originalIndex);
                                      setEditingHistoryName(entry.name || 'Anónimo');
                                    }}
                                    className="p-1 text-zinc-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Editar nombre"
                                  >
                                    <Settings className="w-3 h-3" />
                                  </button>
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{entry.date}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-zinc-600">
                              {entry.modules.length === 4 ? 'Contabilidad Financiera I' : `Módulos: ${entry.modules.join(', ')}`}
                            </span>
                          </div>
                          <span className="text-xl font-black text-emerald-600 shrink-0">{entry.score}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {gameStatus === 'playing' && currentQuestion && (
            <motion.div 
              key={currentQuestion.code}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-zinc-100 text-center space-y-10">
                <div className="space-y-4">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-[0.3em]">
                    {gameQuestionType === 'code' ? '¿Cuál es el número de cuenta?' : '¿Qué saldos puede tener esta cuenta?'}
                  </span>
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="text-4xl font-black text-zinc-900 leading-tight">
                      {gameQuestionType === 'code' ? currentQuestionText : `${currentQuestion.code} - ${currentQuestion.name}`}
                    </h3>
                  </div>
                </div>

                <form onSubmit={handleGameAnswer} className="space-y-6">
                  {gameQuestionType === 'code' ? (
                    <div className="relative">
                      <input 
                        autoFocus
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Escribe el código..."
                        className={`w-full text-center text-5xl font-black p-8 rounded-[2rem] border-4 transition-all outline-none ${
                          lastAnswerCorrect === true ? 'border-emerald-500 bg-emerald-50 text-emerald-600' :
                          lastAnswerCorrect === false ? 'border-red-500 bg-red-50 text-red-600 animate-shake' :
                          'border-zinc-100 bg-zinc-50 focus:border-emerald-500 focus:bg-white'
                        }`}
                      />
                      {lastAnswerCorrect === true && (
                        <motion.div 
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="absolute -top-4 -right-4 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg"
                        >
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </motion.div>
                      )}
                      {lastAnswerCorrect === false && (
                        <motion.div 
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="absolute -top-4 -right-4 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                        >
                          <X className="w-6 h-6 text-white" />
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {['Saldo deudor', 'Saldo acreedor', 'Saldo nulo'].map(balance => (
                        <button
                          key={balance}
                          type="button"
                          onClick={() => {
                            setSelectedBalances(prev => 
                              prev.includes(balance) ? prev.filter(b => b !== balance) : [...prev, balance]
                            );
                          }}
                          className={`p-5 rounded-2xl border-4 font-bold text-xl transition-all flex items-center justify-between ${
                            selectedBalances.includes(balance)
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-zinc-100 bg-zinc-50 text-zinc-500 hover:border-zinc-200'
                          } ${
                            lastAnswerCorrect === false && getCorrectBalances(currentQuestion.code).includes(balance)
                              ? 'border-emerald-200 bg-emerald-50'
                              : ''
                          }`}
                        >
                          {balance}
                          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${
                            selectedBalances.includes(balance) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'
                          }`}>
                            {selectedBalances.includes(balance) && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <button 
                    type="submit"
                    disabled={gameQuestionType === 'balance' && selectedBalances.length === 0}
                    className="w-full py-5 bg-zinc-900 text-white rounded-[1.5rem] font-black text-xl shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                  >
                    {gameQuestionType === 'balance' ? 'CONFIRMAR SELECCIÓN' : 'COMPROBAR'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {gameStatus === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-zinc-100 text-center space-y-8">
                <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-4xl font-black text-zinc-900 uppercase tracking-tight">GAME OVER</h3>
                  <p className="text-zinc-500 font-medium">¡Te has quedado sin vidas!</p>
                </div>
                <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-1">Puntuación Final</span>
                  <span className="text-5xl font-black text-emerald-600">{gameScore}</span>
                </div>
                
                {!isScoreSaved ? (
                  <div className="space-y-4">
                    <div className="text-left space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-4">Tu Nombre</label>
                      <input 
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Escribe tu nombre..."
                        className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-emerald-500 outline-none font-bold text-zinc-700 transition-all"
                        autoFocus
                      />
                    </div>
                    <button 
                      onClick={() => saveScore(gameScore, playerName)}
                      className="w-full py-5 bg-zinc-900 text-white rounded-[1.5rem] font-black text-xl shadow-xl hover:bg-black transition-all active:scale-95"
                    >
                      GUARDAR PUNTUACIÓN
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-2 text-emerald-700 font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                      ¡Puntuación guardada!
                    </div>
                    <button 
                      onClick={() => setGameStatus('selection')}
                      className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95"
                    >
                      VOLVER A INTENTAR
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-4xl w-full space-y-12">
          <div className="text-center space-y-4">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[11px] font-bold uppercase tracking-[0.2em] rounded-full mb-2"
            >
              Plataforma de Aprendizaje
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black text-zinc-900 tracking-tight"
            >
              Tutor de <span className="text-emerald-600">Contabilidad</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-zinc-500 font-medium max-w-2xl mx-auto"
            >
              Domina el ciclo contable con la herramienta interactiva diseñada para estudiantes y profesionales por Daniel Arnaiz Boluda.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Modo Contabilizar */}
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('app')}
              className="group relative bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-zinc-200/50 border border-zinc-100 text-left transition-all hover:border-emerald-500/50"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mb-8 group-hover:bg-emerald-600 transition-colors duration-300">
                <Calculator className="w-10 h-10 text-emerald-600 group-hover:text-white" />
              </div>
              <h3 className="text-3xl font-bold text-zinc-900 mb-4">Contabilizar</h3>
              <p className="text-zinc-500 leading-relaxed text-lg">
                Practica asientos contables, gestiona el libro diario y visualiza el balance de situación en tiempo real con ayuda de IA.
              </p>
              <div className="mt-10 flex items-center text-emerald-600 font-bold text-sm uppercase tracking-widest">
                Empezar ahora <ChevronRight className="ml-2 w-5 h-5" />
              </div>
            </motion.button>

            {/* Modo Repasar Cuentas */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('repasar')}
              className="group relative bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-zinc-200/50 border border-zinc-100 text-left transition-all hover:border-zinc-200"
            >
              <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center mb-8">
                <BookOpen className="w-10 h-10 text-zinc-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="absolute top-10 right-10 px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full">
                Nuevo
              </div>
              <h3 className="text-3xl font-bold text-zinc-900 mb-4">Repasar cuentas</h3>
              <p className="text-zinc-500 leading-relaxed text-lg">
                Aprende y memoriza el Plan General Contable con ejercicios interactivos de clasificación y definición de cuentas.
              </p>
              <div className="mt-10 flex items-center text-emerald-600 font-bold text-sm uppercase tracking-widest">
                Jugar ahora <ChevronRight className="ml-2 w-5 h-5" />
              </div>
            </motion.button>
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center pt-8"
          >
            <p className="text-zinc-400 text-sm font-medium">© 2026 Daniel Arnaiz Boluda. Todos los derechos reservados.</p>
          </motion.div>
        </div>

        <AnimatePresence>
          {showToast && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="bg-zinc-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-zinc-800">
                <AlertCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">{showToast.message}</span>
                <button onClick={() => setShowToast(null)} className="ml-2 hover:text-emerald-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {isCustomizing && <CustomizationModal />}
      {showResetConfirm && <ResetConfirmModal />}
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentView('home')}
            className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors group"
            title="Volver al menú principal"
          >
            <Calculator className="text-white w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">ContaIA ─ Daniel Arnaiz Boluda</h1>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Balance Dinámico & Tutoría Socrática</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={saveSession}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-emerald-100"
              title="Guardar progreso"
            >
              <Save className="w-4 h-4" />
              <span className="hidden md:inline">Guardar</span>
            </button>
            <button 
              onClick={() => loadSession(false)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-blue-100"
              title="Cargar progreso"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden md:inline">Cargar</span>
            </button>
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-red-100"
              title="Reiniciar sesión"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden md:inline">Reiniciar</span>
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-200 hidden sm:block" />

          <button 
            onClick={() => setIsCustomizing(true)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">Personalizar</span>
          </button>
          
          <button 
            onClick={() => setIsPizarraMode(!isPizarraMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              isPizarraMode 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden md:inline">Pizarra</span>
          </button>

          {isPizarraMode && (
            <button 
              onClick={() => setPizarraColumns(prev => prev === 1 ? 2 : 1)}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-zinc-200"
              title={pizarraColumns === 1 ? "Cambiar a 2 columnas" : "Cambiar a 1 columna"}
            >
              {pizarraColumns === 1 ? <Columns className="w-4 h-4" /> : <Layout className="w-4 h-4" />}
              <span className="hidden md:inline">{pizarraColumns === 1 ? '2 Columnas' : '1 Columna'}</span>
            </button>
          )}

          <div className="h-6 w-px bg-zinc-200 hidden sm:block" />

          <div className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider hidden lg:block ${Math.abs(totalAssets - totalLiabilities) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {Math.abs(totalAssets - totalLiabilities) < 0.01 ? 'Cuadrado' : 'Descuadrado'}
          </div>
        </div>
      </header>

      {flyingAccount && (
        <FlyingAccount 
          name={flyingAccount.name} 
          amount={flyingAccount.amount} 
          targetId={flyingAccount.targetId}
          onComplete={() => {
            setCurrentBalance(flyingAccount.nextBalance);
            setFlyingAccount(null);
          }} 
        />
      )}

      <main className={`${isPizarraMode ? 'max-w-full' : 'max-w-7xl'} mx-auto p-4 md:p-6 h-[calc(100vh-88px)] overflow-y-auto app-content`}>
        <style>
          {`
            .app-content {
              --app-font-scale: ${isPizarraMode ? 1 : fontScale / 100};
              font-size: calc(100% * var(--app-font-scale));
            }
            .pizarra-balance-container {
              --app-font-scale: ${balanceFontScale / 100};
            }
            .pizarra-journal-container {
              --app-font-scale: ${journalFontScale / 100};
            }
            /* Scale standard Tailwind text classes */
            .app-content .text-xs { font-size: calc(0.75rem * var(--app-font-scale)) !important; }
            .app-content .text-sm { font-size: calc(0.875rem * var(--app-font-scale)) !important; }
            .app-content .text-base { font-size: calc(1rem * var(--app-font-scale)) !important; }
            .app-content .text-lg { font-size: calc(1.125rem * var(--app-font-scale)) !important; }
            .app-content .text-xl { font-size: calc(1.25rem * var(--app-font-scale)) !important; }
            .app-content .text-2xl { font-size: calc(1.5rem * var(--app-font-scale)) !important; }
            .app-content .text-3xl { font-size: calc(1.875rem * var(--app-font-scale)) !important; }
            
            /* Scale arbitrary pixel-based text classes found in the app */
            ${[9, 10, 11, 12, 13, 14, 15, 17, 18].map(size => `
              .app-content .text-\\[${size}px\\] { font-size: calc(${size}px * var(--app-font-scale)) !important; }
            `).join('')}

            /* Scale monospace fonts specifically */
            .app-content .font-mono {
              font-size: calc(1em * var(--app-font-scale));
            }

            /* Ensure inputs, buttons, and all text scale */
            .app-content input, 
            .app-content button, 
            .app-content textarea,
            .app-content select,
            .app-content span,
            .app-content p,
            .app-content h1,
            .app-content h2,
            .app-content h3,
            .app-content h4,
            .app-content div {
              font-size: inherit;
            }
            
            /* Re-apply Tailwind overrides for scaled elements */
            .app-content [class*="text-"] {
              font-size: inherit;
            }
          `}
        </style>
        {isPizarraMode ? (
          <div 
            ref={pizarraContainerRef}
            className={`w-full flex flex-col ${pizarraColumns === 2 ? 'lg:flex-row' : ''} gap-0 pb-12 items-start relative`}
          >
            {/* Balance Column */}
            <div 
              className="flex-shrink-0"
              style={{ width: pizarraColumns === 2 ? `${pizarraSplit}%` : '100%' }}
            >
              <div className={pizarraColumns === 2 ? "mr-4" : ""}>
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-emerald-600" /> Balance actualizado
                      </span>
                      <div className="flex items-center bg-zinc-100 rounded-lg px-1 py-0.5">
                        <button 
                          onClick={() => setBalanceFontScale(prev => Math.max(70, prev - 10))}
                          className="p-1 hover:bg-zinc-200 text-zinc-600 rounded transition-colors"
                          title="Disminuir letra"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-bold text-zinc-500 min-w-[2.5rem] text-center">{balanceFontScale}%</span>
                        <button 
                          onClick={() => setBalanceFontScale(prev => Math.min(200, prev + 10))}
                          className="p-1 hover:bg-zinc-200 text-zinc-600 rounded transition-colors"
                          title="Aumentar letra"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${Math.abs(totalAssets - totalLiabilities) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {Math.abs(totalAssets - totalLiabilities) < 0.01 ? 'Cuadrado' : 'Descuadrado'}
                    </div>
                  </div>
                  <div className="p-6 pizarra-balance-container">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Assets side */}
                      <div className="space-y-4">
                        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">Activo</h3>
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <h4 id="section-assets-noncurrent-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">No Corriente</h4>
                            <div className="space-y-0.5">
                              {[...currentBalance.assets.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                <BalanceRow key={item.name} item={item} />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <h4 id="section-assets-current-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">Corriente</h4>
                            <div className="space-y-0.5">
                              {[...currentBalance.assets.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                <BalanceRow key={item.name} item={item} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                          <span className="text-[11px] font-bold text-zinc-500 uppercase">Total Activo</span>
                          <span className="text-lg font-black text-emerald-600"><AnimatedNumber value={totalAssets} /></span>
                        </div>
                      </div>

                      {/* Liabilities & Equity side */}
                      <div className="space-y-4">
                        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">Patrimonio Neto + Pasivo</h3>
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <h4 id="section-equity-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">Patrimonio Neto</h4>
                            <div className="space-y-0.5">
                              {[...currentBalance.liabilitiesAndEquity.equity].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                <BalanceRow key={item.name} item={item} />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <h4 id="section-liabilities-noncurrent-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">Pasivo No Corriente</h4>
                            <div className="space-y-0.5">
                              {[...currentBalance.liabilitiesAndEquity.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                <BalanceRow key={item.name} item={item} />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <h4 id="section-liabilities-current-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">Pasivo Corriente</h4>
                            <div className="space-y-0.5">
                              {[...currentBalance.liabilitiesAndEquity.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                <BalanceRow key={item.name} item={item} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                          <span className="text-[11px] font-bold text-zinc-500 uppercase">Total PN + P</span>
                          <span className="text-lg font-black text-emerald-600"><AnimatedNumber value={totalLiabilities} /></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Resizable Divider */}
            {pizarraColumns === 2 && (
              <div 
                onMouseDown={handleMouseDown}
                className={`hidden lg:flex w-1 hover:w-3 -mx-0.5 hover:-mx-1.5 h-full absolute top-0 bottom-0 cursor-col-resize z-10 items-center justify-center group transition-all ${isResizing ? 'bg-emerald-500/20' : ''}`}
                style={{ left: `${pizarraSplit}%` }}
              >
                <div className={`w-0.5 h-16 rounded-full bg-zinc-300 group-hover:bg-emerald-500 transition-colors ${isResizing ? 'bg-emerald-500' : ''}`} />
              </div>
            )}

            {/* Journal Column */}
            <div className="flex-grow min-w-0">
              <div className={pizarraColumns === 2 ? "ml-4" : "mt-8"}>
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-zinc-100 flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-emerald-500" /> Libro Diario
                      </span>
                      <div className="flex items-center bg-zinc-800 rounded-lg px-1 py-0.5 border border-zinc-700">
                        <button 
                          onClick={() => setJournalFontScale(prev => Math.max(70, prev - 10))}
                          className="p-1 hover:bg-zinc-700 text-zinc-400 rounded transition-colors"
                          title="Disminuir letra"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-bold text-zinc-500 min-w-[2.5rem] text-center">{journalFontScale}%</span>
                        <button 
                          onClick={() => setJournalFontScale(prev => Math.min(200, prev + 10))}
                          className="p-1 hover:bg-zinc-700 text-zinc-400 rounded transition-colors"
                          title="Aumentar letra"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center">
                      <button 
                        onClick={() => setIsJournalFullscreen(true)}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400"
                        title="Pantalla Completa"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={clearDraft}
                        className="text-[13px] font-bold uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Limpiar Borrador
                      </button>
                      <button 
                        onClick={() => setCurrentJournal([])}
                        className="text-[13px] font-bold uppercase text-red-500 hover:text-red-400 transition-colors"
                      >
                        Borrar Diario
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-6 pizarra-journal-container">
                    {/* Entry Form */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 px-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Fecha del Asiento</label>
                          <input 
                            type="text"
                            placeholder="dd/mm/aa"
                            value={draftDate}
                            onChange={(e) => setDraftDate(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500 w-32"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-3 text-[12px] font-bold text-zinc-500 uppercase tracking-widest px-2">
                        <div className="col-span-2">Nº Cuenta</div>
                        <div className="col-span-4">Concepto</div>
                        <div className="col-span-2 text-right">Debe</div>
                        <div className="col-span-2 text-right">Haber</div>
                        <div className="col-span-2"></div>
                      </div>
                      
                      <div className="space-y-2">
                        {draft.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-2">
                              <input 
                                type="text"
                                placeholder="Código"
                                value={row.code}
                                onChange={(e) => updateDraft(idx, 'code', e.target.value)}
                                className="w-full bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="col-span-4">
                              <input 
                                type="text"
                                placeholder="Cuenta"
                                value={row.account}
                                onChange={(e) => updateDraft(idx, 'account', e.target.value)}
                                className="w-full bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="col-span-2">
                              <input 
                                type="number"
                                placeholder="0"
                                value={row.debe}
                                onChange={(e) => updateDraft(idx, 'debe', e.target.value)}
                                className="w-full bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-2 py-2 text-right outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="col-span-2">
                              <input 
                                type="number"
                                placeholder="0"
                                value={row.haber}
                                onChange={(e) => updateDraft(idx, 'haber', e.target.value)}
                                className="w-full bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-2 py-2 text-right outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="col-span-2 flex gap-1 items-center">
                              <button 
                                onClick={() => reflectLine(idx)}
                                disabled={row.reflected || (!parseFloat(row.debe) && !parseFloat(row.haber)) || !row.account}
                                className={`flex-1 py-1.5 rounded-lg transition-all ${
                                  row.reflected 
                                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 border border-zinc-600'
                                } disabled:opacity-30 flex items-center justify-center`}
                                title={row.reflected ? 'Reflejado' : 'Reflejar'}
                              >
                                <RefreshCw className={`w-3 h-3 ${row.reflected ? 'animate-pulse' : ''}`} />
                              </button>
                              {draft.length > 1 && (
                                <button 
                                  onClick={() => setDraft(draft.filter((_, i) => i !== idx))}
                                  className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center pt-4">
                        <button 
                          onClick={addDraftRow}
                          className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Añadir línea
                        </button>
                        
                        <div className="flex items-center gap-6">
                          <div className="flex gap-4 text-[15px] font-mono">
                            <div className="text-zinc-400">Total Debe: <span className="text-emerald-500">{formatCurrency(draft.reduce((acc, r) => acc + (parseFloat(r.debe) || 0), 0))}</span></div>
                            <div className="text-zinc-400">Total Haber: <span className="text-emerald-500">{formatCurrency(draft.reduce((acc, r) => acc + (parseFloat(r.haber) || 0), 0))}</span></div>
                          </div>
                          <button 
                            onClick={applyManualEntry}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[17px] shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 transition-all"
                          >
                            Contabilizar Asiento
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Historical Journal */}
                    <div className="pt-8 border-t border-zinc-800 space-y-4">
                      <h4 className="text-[13px] font-bold text-zinc-500 uppercase tracking-widest">Asientos Realizados</h4>
                      <div className="space-y-4 font-mono">
                        {currentJournal.map((asiento, aIdx) => (
                          <div key={aIdx} className={aIdx > 0 ? "border-t border-zinc-800 pt-4" : ""}>
                            <div className="mb-2 px-2 flex flex-col">
                              <span className="text-[11px] text-zinc-500">Asiento #{aIdx + 1}</span>
                              <span className="text-[11px] font-bold text-emerald-500/80">{asiento[0]?.date || 'xx/xx/xx'}</span>
                            </div>
                            {asiento.map((row, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-4 text-[14px] py-1 px-2 hover:bg-zinc-800/50 rounded transition-colors">
                                <div className={`col-span-6 ${row.haber > 0 ? 'pl-4 text-zinc-400' : 'text-emerald-400 font-bold'}`}>
                                  {row.haber > 0 ? 'a ' : ''}
                                  {row.code && <span className="text-[10px] opacity-50 mr-1">{row.code}</span>}
                                  {row.account}
                                </div>
                                <div className="col-span-3 text-right text-zinc-300">
                                  {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                                </div>
                                <div className="col-span-3 text-right text-zinc-300">
                                  {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                        {currentJournal.length === 0 && (
                          <p className="text-[13px] text-zinc-600 italic text-center py-4">No hay asientos registrados aún</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* Left Column: Visual Balance Sheet */}
            <section className="lg:col-span-6 flex flex-col gap-6 overflow-y-auto pr-2">
              
              {/* Visual Balance Sheet */}
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-emerald-600" /> Balance de Situación Visual
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tiempo Real</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-6 overflow-y-auto max-h-[550px] scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
                  {/* Assets side */}
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">Activo</h3>
                    
                    {/* Non-Current Assets */}
                    <div className="space-y-1">
                      <h4 id="section-assets-noncurrent" className="text-[10px] font-bold text-zinc-400 uppercase">No Corriente</h4>
                      <div className="space-y-0.5 min-h-[30px]">
                        {[...currentBalance.assets.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item, idx) => (
                          <BalanceRow key={item.name} item={item} />
                        ))}
                        {currentBalance.assets.nonCurrent.length === 0 && <div className="text-[10px] text-zinc-300 italic px-2">Sin elementos</div>}
                      </div>
                    </div>

                    {/* Current Assets */}
                    <div className="space-y-1">
                      <h4 id="section-assets-current" className="text-[10px] font-bold text-zinc-400 uppercase">Corriente</h4>
                      <div className="space-y-0.5 min-h-[30px]">
                        {[...currentBalance.assets.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item, idx) => (
                          <BalanceRow key={item.name} item={item} />
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                      <span className="text-[11px] font-bold text-zinc-500">TOTAL ACTIVO</span>
                      <span className="text-base font-black text-emerald-600"><AnimatedNumber value={totalAssets} /></span>
                    </div>
                  </div>

                  {/* Liabilities & Equity side */}
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">Patrimonio Neto + Pasivo</h3>
                    
                    {/* Equity */}
                    <div className="space-y-1">
                      <h4 id="section-equity" className="text-[10px] font-bold text-zinc-400 uppercase">Patrimonio Neto</h4>
                      <div className="space-y-0.5 min-h-[30px]">
                        {[...currentBalance.liabilitiesAndEquity.equity].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item, idx) => (
                          <BalanceRow key={item.name} item={item} />
                        ))}
                      </div>
                    </div>

                    {/* Non-Current Liabilities */}
                    <div className="space-y-1">
                      <h4 id="section-liabilities-noncurrent" className="text-[10px] font-bold text-zinc-400 uppercase">Pasivo No Corriente</h4>
                      <div className="space-y-0.5 min-h-[30px]">
                        {[...currentBalance.liabilitiesAndEquity.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item, idx) => (
                          <BalanceRow key={item.name} item={item} />
                        ))}
                        {currentBalance.liabilitiesAndEquity.nonCurrent.length === 0 && <div className="text-[10px] text-zinc-300 italic px-2">Sin elementos</div>}
                      </div>
                    </div>

                    {/* Current Liabilities */}
                    <div className="space-y-1">
                      <h4 id="section-liabilities-current" className="text-[10px] font-bold text-zinc-400 uppercase">Pasivo Corriente</h4>
                      <div className="space-y-0.5 min-h-[30px]">
                        {[...currentBalance.liabilitiesAndEquity.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item, idx) => (
                          <BalanceRow key={item.name} item={item} />
                        ))}
                        {currentBalance.liabilitiesAndEquity.current.length === 0 && <div className="text-[10px] text-zinc-300 italic px-2">Sin elementos</div>}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                      <span className="text-[11px] font-bold text-zinc-500">TOTAL PN + P</span>
                      <span className="text-base font-black text-emerald-600"><AnimatedNumber value={totalLiabilities} /></span>
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-[10px] text-emerald-800 leading-tight">
                      Observa cómo cada operación que discutimos se refleja aquí. La contabilidad es el arte de mantener este equilibrio.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Right Column: Chat Interface & Journal */}
            <section className="lg:col-span-6 flex flex-col gap-6 overflow-y-auto pr-2">
              <div className="flex flex-col bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden h-[500px]">
                <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600" /> Conversación
                  </span>
                  <button 
                    onClick={() => {
                      setMessages([{
                        id: '1',
                        role: 'bot',
                        text: '¡Hola! Soy tu tutor de contabilidad. ¿En qué operación te gustaría trabajar hoy?',
                        timestamp: new Date(),
                        balance: INITIAL_BALANCE
                      }]);
                      setCurrentBalance(INITIAL_BALANCE);
                    }}
                    className="p-2 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200"
                >
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                            msg.role === 'user' ? 'bg-zinc-800' : 'bg-emerald-100'
                          }`}>
                            {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-emerald-700" />}
                          </div>
                          <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-zinc-900 text-white rounded-tr-none' 
                              : 'bg-zinc-50 border border-zinc-100 text-zinc-800 rounded-tl-none'
                          }`}>
                            <div className="whitespace-pre-wrap prose prose-sm max-w-none">
                              {msg.text}
                            </div>
                            <div className={`text-[10px] mt-2 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl rounded-tl-none flex gap-2 items-center">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-zinc-100">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Describe una operación contable..."
                      className="w-full pl-4 pr-12 py-3 bg-zinc-100 border-none rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all text-sm outline-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Journal Entry */}
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-zinc-800 bg-zinc-800/50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-500" /> Libro Diario (En Tiempo Real)
                  </span>
                  <button 
                    onClick={() => setIsJournalFullscreen(true)}
                    className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400"
                    title="Pantalla Completa"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-3 font-mono flex-1 overflow-hidden flex flex-col max-h-[400px]">
                  <div className="grid grid-cols-12 gap-2 text-[12px] font-bold text-zinc-500 uppercase tracking-widest px-2 border-b border-zinc-800 pb-2 flex-shrink-0">
                    <div className="col-span-6">Cuenta / Concepto</div>
                    <div className="col-span-3 text-right">Debe</div>
                    <div className="col-span-3 text-right">Haber</div>
                  </div>
                  <div className="space-y-4 min-h-[100px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {currentJournal.map((asiento, aIdx) => (
                      <div key={aIdx} className={aIdx > 0 ? "border-t border-white pt-4" : ""}>
                        {asiento.map((row, idx) => (
                          <motion.div 
                            key={idx} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="grid grid-cols-12 gap-2 text-[14px] py-1 px-2 hover:bg-zinc-800/50 rounded transition-colors"
                          >
                            <div className={`col-span-6 ${row.haber > 0 ? 'pl-4 text-zinc-400' : 'text-emerald-400 font-bold'}`}>
                              {row.haber > 0 ? 'a ' : ''}
                              {row.code && <span className="text-[10px] opacity-50 mr-1">{row.code}</span>}
                              {row.account}
                            </div>
                            <div className="col-span-3 text-right text-zinc-300">
                              {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                            </div>
                            <div className="col-span-3 text-right text-zinc-300">
                              {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ))}
                    {currentJournal.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-[100px] text-zinc-600 text-[13px] italic">
                        <p>El tutor irá completando el asiento</p>
                        <p>a medida que aciertes el razonamiento</p>
                      </div>
                    )}
                  </div>
                  
                  {currentJournal.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-zinc-800 flex justify-between items-center text-[13px] font-bold flex-shrink-0">
                      <div className="text-zinc-500 uppercase">Sumas y Saldos</div>
                      <div className="flex gap-4">
                        <div className="text-emerald-500">D: {formatCurrency(currentJournal.flat().reduce((acc, r) => acc + r.debe, 0))}</div>
                        <div className="text-zinc-400">H: {formatCurrency(currentJournal.flat().reduce((acc, r) => acc + r.haber, 0))}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Fullscreen Journal Overlay */}
      <AnimatePresence>
        {isJournalFullscreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col p-6 app-content"
          >
            <div className="flex items-center justify-between mb-6 border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <BookOpen className="text-white w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Libro Diario ─ Vista Completa</h2>
                  <p className="text-sm text-zinc-500 uppercase tracking-widest">Historial de Asientos y Registro</p>
                </div>
              </div>
              <button 
                onClick={() => setIsJournalFullscreen(false)}
                className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl transition-all shadow-xl"
              >
                <Minimize2 className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl">
              <div className="p-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                <div className="w-full space-y-8">
                  {/* Header for columns */}
                  <div className="grid grid-cols-12 gap-6 text-sm font-bold text-zinc-500 uppercase tracking-widest px-4 border-b border-zinc-800 pb-4">
                    <div className="col-span-6">Cuenta / Concepto</div>
                    <div className="col-span-3 text-right">Debe</div>
                    <div className="col-span-3 text-right">Haber</div>
                  </div>

                  {/* Entries */}
                  <div className="space-y-8 font-mono">
                    {currentJournal.map((asiento, aIdx) => (
                      <div key={aIdx} className={aIdx > 0 ? "border-t border-white pt-8" : ""}>
                        <div className="mb-4 flex items-center gap-3">
                          <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Asiento #{aIdx + 1}</span>
                        </div>
                        {asiento.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-6 text-[18px] py-2 px-4 hover:bg-zinc-800/50 rounded-xl transition-colors">
                            <div className={`col-span-6 ${row.haber > 0 ? 'pl-8 text-zinc-400' : 'text-emerald-400 font-bold'}`}>
                              {row.haber > 0 ? 'a ' : ''}
                              {row.code && <span className="text-[12px] opacity-50 mr-2">{row.code}</span>}
                              {row.account}
                            </div>
                            <div className="col-span-3 text-right text-zinc-200">
                              {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                            </div>
                            <div className="col-span-3 text-right text-zinc-200">
                              {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {currentJournal.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-600 italic">
                        <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-xl">No hay asientos registrados aún</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer with Totals */}
              {currentJournal.length > 0 && (
                <div className="p-8 bg-zinc-800/50 border-t border-zinc-800">
                  <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div className="text-zinc-400 font-bold uppercase tracking-widest">Sumas y Saldos Totales</div>
                    <div className="flex gap-12 text-2xl font-mono font-black">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase mb-1">Total Debe</span>
                        <span className="text-emerald-500">{formatCurrency(currentJournal.flat().reduce((acc, r) => acc + r.debe, 0))}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase mb-1">Total Haber</span>
                        <span className="text-zinc-300">{formatCurrency(currentJournal.flat().reduce((acc, r) => acc + r.haber, 0))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[500] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              showToast.type === 'success' 
                ? 'bg-emerald-600 border-emerald-500 text-white' 
                : 'bg-red-600 border-red-500 text-white'
            }`}
          >
            {showToast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{showToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
