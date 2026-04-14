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
  History,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DigitalWhiteboard } from './components/DigitalWhiteboard';

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
  const isNegative = value < 0;
  const absNum = Math.abs(value);
  const parts = absNum.toFixed(2).split('.');
  
  // Add dots for thousands
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  let result = (isNegative ? '-' : '') + parts[0];
  
  // Add decimals if they are not .00
  if (absNum % 1 !== 0) {
    let decimals = parts[1];
    if (decimals.endsWith('0')) decimals = decimals.substring(0, 1);
    result += ',' + decimals;
  }
  
  return result + '€';
};

// --- Constants ---
const MODULE_ACCOUNTS: Record<number, { code: string, name: string, examples?: string[], scenarios?: { text: string, action: 'debit' | 'credit' }[] }[]> = {
  1: [
    { 
      code: '100', 
      name: 'Capital social', 
      scenarios: [
        { text: 'En la constitución de la sociedad (Ej: creación de una S.A. con talón bancario) de Capital social', action: 'credit' },
        { text: 'Por las reducciones de capital o extinción de la sociedad de Capital social', action: 'debit' }
      ]
    },
    { 
      code: '101', 
      name: 'Fondo social', 
      scenarios: [
        { text: 'Por la aportación inicial al crear una entidad sin ánimo de lucro (Ej: tres amigos crean una asociación depositando fondos) de Fondo social', action: 'credit' },
        { text: 'A la extinción de la entidad de Fondo social', action: 'debit' }
      ]
    },
    { 
      code: '102', 
      name: 'Capital', 
      scenarios: [
        { text: 'Por el capital inicial (Ej: empresario individual aporta efectivo a su firma) de Capital', action: 'credit' },
        { text: 'Por el cese o cesión de los negocios de Capital', action: 'debit' }
      ]
    },
    { 
      code: '103', 
      name: 'Socios por desembolsos no exigidos', 
      scenarios: [
        { text: 'Al constituirse la sociedad por el nominal no desembolsado (Ej: constitución de S.A. desembolsando solo el mínimo legal) de Socios por desembolsos no exigidos', action: 'debit' },
        { text: 'Cuando la sociedad exige formalmente el desembolso de Socios por desembolsos no exigidos', action: 'credit' }
      ]
    },
    { 
      code: '112', 
      name: 'Reserva legal', 
      scenarios: [
        { text: 'Al cierre del ejercicio con cargo a la cuenta de resultados (Ej: destino de parte del beneficio tras la regularización) de Reserva legal', action: 'credit' },
        { text: 'Por la disposición que se haga de ella de Reserva legal', action: 'debit' }
      ]
    },
    { 
      code: '129', 
      name: 'Resultado del ejercicio', 
      scenarios: [
        { text: 'Para determinar el resultado si los ingresos superan a los gastos (Ej: regularización de ingresos del grupo 7) de Resultado del ejercicio', action: 'credit' },
        { text: 'Si los gastos superan a los ingresos o al aplicar el beneficio de Resultado del ejercicio', action: 'debit' }
      ]
    },
    { 
      code: '170', 
      name: 'Deudas a largo plazo con entidades de crédito', 
      scenarios: [
        { text: 'Al formalizar el préstamo (Ej: préstamo bancario a devolver en 5 años) de Deudas a largo plazo con entidades de crédito', action: 'credit' },
        { text: 'Por el reintegro anticipado o la reclasificación a corto plazo de Deudas a largo plazo con entidades de crédito', action: 'debit' }
      ]
    },
    { 
      code: '173', 
      name: 'Proveedores de inmovilizado a largo plazo', 
      scenarios: [
        { text: 'Por la recepción conforme de los bienes (Ej: compra de máquina pagando una parte a 18 meses) de Proveedores de inmovilizado a largo plazo', action: 'credit' },
        { text: 'Al cancelar o pagar la deuda anticipadamente de Proveedores de inmovilizado a largo plazo', action: 'debit' }
      ]
    },
    { 
      code: '175', 
      name: 'Efectos a pagar a largo plazo', 
      scenarios: [
        { text: 'Al aceptar los efectos (Ej: letras aceptadas a 24 meses por compra de inmuebles) de Efectos a pagar a largo plazo', action: 'credit' },
        { text: 'Por el pago anticipado o reclasificación de Efectos a pagar a largo plazo', action: 'debit' }
      ]
    },
    { 
      code: '180', 
      name: 'Fianzas recibidas a largo plazo', 
      scenarios: [
        { text: 'Al recibir la garantía (Ej: cobro de fianza por alquiler de edificio a 6 años) de Fianzas recibidas a largo plazo', action: 'credit' },
        { text: 'Al devolver la fianza o por su reclasificación a corto plazo de Fianzas recibidas a largo plazo', action: 'debit' }
      ]
    }
  ],
  2: [
    { 
      code: '203', 
      name: 'Propiedad industrial', 
      scenarios: [
        { text: 'Por la adquisición (Ej: compra de patente para fabricar carne vegetal) de Propiedad industrial', action: 'debit' },
        { text: 'Por enajenación o baja del activo de Propiedad industrial', action: 'credit' }
      ]
    },
    { 
      code: '205', 
      name: 'Derechos de traspaso', 
      scenarios: [
        { text: 'Al pagar al arrendatario anterior (Ej: pago por subrogación en contrato de oficinas) de Derechos de traspaso', action: 'debit' },
        { text: 'Por baja o venta del derecho de Derechos de traspaso', action: 'credit' }
      ]
    },
    { 
      code: '206', 
      name: 'Aplicaciones informáticas', 
      scenarios: [
        { text: 'Por la compra a terceros (Ej: adquisición de software de gestión) de Aplicaciones informáticas', action: 'debit' },
        { text: 'Por su baja o venta de Aplicaciones informáticas', action: 'credit' }
      ]
    },
    { 
      code: '210', 
      name: 'Terrenos y bienes naturales', 
      scenarios: [
        { text: 'Al adquirir el suelo (Ej: compra de un hotel separando el valor del solar) de Terrenos y bienes naturales', action: 'debit' },
        { text: 'Al vender el terreno (Ej: venta del local social) de Terrenos y bienes naturales', action: 'credit' }
      ]
    },
    { 
      code: '211', 
      name: 'Construcciones', 
      scenarios: [
        { text: 'Por la compra del edificio (Ej: adquisición de naves u oficinas) de Construcciones', action: 'debit' },
        { text: 'Por su venta (Ej: enajenación de locales sin beneficio ni pérdida) de Construcciones', action: 'credit' }
      ]
    },
    { 
      code: '212', 
      name: 'Instalaciones técnicas', 
      scenarios: [
        { text: 'Por la compra (Ej: hospital adquiere equipo quirúrgico especial) de Instalaciones técnicas', action: 'debit' },
        { text: 'Por devolución al proveedor o enajenación de Instalaciones técnicas', action: 'credit' }
      ]
    },
    { 
      code: '213', 
      name: 'Maquinaria', 
      scenarios: [
        { text: 'Por la adquisición (Ej: compra de máquina de uso industrial) de Maquinaria', action: 'debit' },
        { text: 'Por venta (Ej: venta de equipo industrial obsoleto) de Maquinaria', action: 'credit' }
      ]
    },
    { 
      code: '214', 
      name: 'Utillaje', 
      scenarios: [
        { text: 'Al comprar las herramientas (Ej: compra de herramientas para el almacén pagadas con tarjeta) de Utillaje', action: 'debit' },
        { text: 'Por regularización anual o rotura de Utillaje', action: 'credit' }
      ]
    },
    { 
      code: '215', 
      name: 'Otras instalaciones', 
      scenarios: [
        { text: 'Por la compra (Ej: adquisición de pistas de fútbol/baloncesto para empleados) de Otras instalaciones', action: 'debit' },
        { text: 'Por baja o venta de Otras instalaciones', action: 'credit' }
      ]
    },
    { 
      code: '216', 
      name: 'Mobiliario', 
      scenarios: [
        { text: 'Por la adquisición (Ej: compra a crédito de muebles de oficina) de Mobiliario', action: 'debit' },
        { text: 'Por su baja del activo de Mobiliario', action: 'credit' }
      ]
    },
    { 
      code: '217', 
      name: 'Equipos para procesos de información', 
      scenarios: [
        { text: 'Por la compra (Ej: empresa de fruta adquiere ordenadores para el almacén) de Equipos para procesos de información', action: 'debit' },
        { text: 'Por venta o fin de vida útil de Equipos para procesos de información', action: 'credit' }
      ]
    },
    { 
      code: '218', 
      name: 'Elementos de transporte', 
      scenarios: [
        { text: 'Por la adquisición (Ej: compra al contado de una furgoneta de reparto) de Elementos de transporte', action: 'debit' },
        { text: 'Por baja definitiva (Ej: furgoneta carbonizada en incendio declarada siniestro total) de Elementos de transporte', action: 'credit' }
      ]
    },
    { 
      code: '219', 
      name: 'Otro inmovilizado material', 
      scenarios: [
        { text: 'Por la compra (Ej: adquisición de papeleras y contenedores para administración) de Otro inmovilizado material', action: 'debit' },
        { text: 'Por baja del activo de Otro inmovilizado material', action: 'credit' }
      ]
    },
    { 
      code: '240', 
      name: 'Participaciones a largo plazo en partes vinculadas', 
      scenarios: [
        { text: 'A la compra (Ej: empresa adquiere acciones de una firma de su mismo grupo) de Participaciones a largo plazo en partes vinculadas', action: 'debit' },
        { text: 'Por enajenación o deterioro de Participaciones a largo plazo en partes vinculadas', action: 'credit' }
      ]
    },
    { 
      code: '241', 
      name: 'Valores representativos de deuda a largo plazo con partes vinculadas', 
      scenarios: [
        { text: 'A la suscripción (Ej: compra de títulos de renta fija con vencimiento a 5 años) de Valores representativos de deuda a largo plazo con partes vinculadas', action: 'debit' },
        { text: 'Por venta o amortización de Valores representativos de deuda a largo plazo con partes vinculadas', action: 'credit' }
      ]
    },
    { 
      code: '250', 
      name: 'Participaciones a largo plazo', 
      scenarios: [
        { text: 'A la compra (Ej: empresa adquiere acciones de una firma de su mismo grupo) de Participaciones a largo plazo', action: 'debit' },
        { text: 'Por enajenación o deterioro de Participaciones a largo plazo', action: 'credit' }
      ]
    },
    { 
      code: '251', 
      name: 'Valores representativos de deuda a largo plazo', 
      scenarios: [
        { text: 'A la suscripción (Ej: compra de títulos de renta fija con vencimiento a 5 años) de Valores representativos de deuda a largo plazo', action: 'debit' },
        { text: 'Por venta o amortización de Valores representativos de deuda a largo plazo', action: 'credit' }
      ]
    },
    { 
      code: '252', 
      name: 'Créditos a largo plazo', 
      scenarios: [
        { text: 'A la formalización (Ej: préstamo concedido a un amigo a devolver en 30 meses) de Créditos a largo plazo', action: 'debit' },
        { text: 'Por el cobro o reclasificación de Créditos a largo plazo', action: 'credit' }
      ]
    },
    { 
      code: '258', 
      name: 'Imposiciones a largo plazo', 
      scenarios: [
        { text: 'Al recuperar los fondos de Imposiciones a largo plazo', action: 'credit' }
      ]
    }
  ],
  3: [
    { 
      code: '300', 
      name: 'Mercaderías', 
      scenarios: [
        { text: 'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento físico de fruta en almacén el 31/12)', action: 'debit' },
        { text: 'Al cierre del ejercicio por el valor de las existencias iniciales de Mercaderías', action: 'credit' }
      ]
    },
    { 
      code: '310', 
      name: 'Materias primas', 
      scenarios: [
        { text: 'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento de harina en una panadería)', action: 'debit' },
        { text: 'Al cierre del ejercicio por el valor de las existencias iniciales de Materias primas', action: 'credit' }
      ]
    },
    { 
      code: '320', 
      name: 'Otros aprovisionamientos', 
      scenarios: [
        { text: 'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento de envases o repuestos)', action: 'debit' },
        { text: 'Al cierre del ejercicio por el valor de las existencias iniciales de Otros aprovisionamientos', action: 'credit' }
      ]
    },
    { 
      code: '600', 
      name: 'Compra de mercaderías', 
      scenarios: [
        { text: 'Al recibir el pedido (Ej: compra de naranjas a un agricultor)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Compra de mercaderías contra Resultado del ejercicio', action: 'credit' }
      ]
    },
    { 
      code: '601', 
      name: 'Compra de materias primas', 
      scenarios: [
        { text: 'Al recibir el pedido (Ej: compra de madera para fabricar muebles)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Compra de materias primas', action: 'credit' }
      ]
    },
    { 
      code: '602', 
      name: 'Compras de otros aprovisionamientos', 
      scenarios: [
        { text: 'Al recibir el pedido (Ej: compra de cajas de cartón para embalaje)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Compras de otros aprovisionamientos', action: 'credit' }
      ]
    },
    { 
      code: '606', 
      name: 'Descuentos sobre compras por pronto pago', 
      scenarios: [
        { text: 'Al pagar antes del plazo pactado (Ej: descuento del 2 % por pagar al contado)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Descuentos sobre compras por pronto pago', action: 'debit' }
      ]
    },
    { 
      code: '608', 
      name: 'Devoluciones de compras y operaciones similares', 
      scenarios: [
        { text: 'Al devolver mercancía defectuosa (Ej: devolución de fruta en mal estado)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Devoluciones de compras', action: 'debit' }
      ]
    },
    { 
      code: '609', 
      name: '«Rappels» por compras', 
      scenarios: [
        { text: 'Descuento que te aplica el vendedor por alcanzar un volumen de pedido alto', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Rappels por compras', action: 'debit' }
      ]
    },
    { 
      code: '610', 
      name: 'Variación de existencias de mercaderías', 
      scenarios: [
        { text: 'Al cierre del ejercicio por las existencias iniciales de Variación de existencias de mercaderías', action: 'debit' },
        { text: 'Al cierre del ejercicio por las existencias finales de Variación de existencias de mercaderías', action: 'credit' }
      ]
    },
    { 
      code: '620', 
      name: 'Gastos en investigación y desarrollo del ejercicio', 
      scenarios: [
        { text: 'Por los gastos realizados (Ej: pago a laboratorio por estudio de nuevos sabores)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Gastos en I+D', action: 'credit' }
      ]
    },
    { 
      code: '621', 
      name: 'Arrendamientos y cánones', 
      scenarios: [
        { text: 'Al recibir la factura del alquiler (Ej: pago mensual del local de la tienda)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Arrendamientos', action: 'credit' }
      ]
    },
    { 
      code: '622', 
      name: 'Reparaciones y conservación', 
      scenarios: [
        { text: 'Por el mantenimiento (Ej: factura del técnico que arregla el aire acondicionado)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Reparaciones', action: 'credit' }
      ]
    },
    { 
      code: '623', 
      name: 'Servicios de profesionales independientes', 
      scenarios: [
        { text: 'Por los honorarios (Ej: factura del abogado o del gestor contable)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Servicios profesionales', action: 'credit' }
      ]
    },
    { 
      code: '624', 
      name: 'Transportes', 
      scenarios: [
        { text: 'Por los portes (Ej: pago a la agencia de transportes por enviar pedidos)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Transportes', action: 'credit' }
      ]
    },
    { 
      code: '625', 
      name: 'Primas de seguros', 
      scenarios: [
        { text: 'Al pagar la póliza (Ej: seguro anual contra incendios del almacén)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Seguros', action: 'credit' }
      ]
    },
    { 
      code: '626', 
      name: 'Servicios bancarios y similares', 
      scenarios: [
        { text: 'Por las comisiones (Ej: cargo del banco por mantenimiento de cuenta)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Servicios bancarios', action: 'credit' }
      ]
    },
    { 
      code: '628', 
      name: 'Suministros', 
      scenarios: [
        { text: 'Por el consumo (Ej: factura de la luz, agua o gas)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Suministros', action: 'credit' }
      ]
    },
    { 
      code: '629', 
      name: 'Otros servicios', 
      scenarios: [
        { text: 'Por gastos diversos (Ej: compra de material de oficina o gastos de viaje)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Otros servicios', action: 'credit' }
      ]
    },
    { 
      code: '650', 
      name: 'Pérdidas de créditos comerciales incobrables', 
      scenarios: [
        { text: 'Al declarar un cliente como fallido (Ej: cliente en concurso de acreedores que no pagará)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Pérdidas por incobrables', action: 'credit' }
      ]
    },
    { 
      code: '662', 
      name: 'Intereses de deudas', 
      scenarios: [
        { text: 'Al devengarse los intereses (Ej: cargo bancario por intereses del préstamo)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Intereses de deudas', action: 'credit' }
      ]
    },
    { 
      code: '666', 
      name: 'Pérdidas en participaciones y valores representativos de deuda', 
      scenarios: [
        { text: 'Al vender con pérdida (Ej: venta de acciones por debajo de su precio de compra)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Pérdidas financieras', action: 'credit' }
      ]
    },
    { 
      code: '678', 
      name: 'Gastos excepcionales', 
      scenarios: [
        { text: 'Por sucesos imprevistos (Ej: pago de una multa de tráfico de la furgoneta)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Gastos excepcionales', action: 'credit' }
      ]
    },
    { 
      code: '700', 
      name: 'Venta de mercaderías', 
      scenarios: [
        { text: 'Al realizar la venta (Ej: venta de 500 kg de manzanas a un supermercado)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Venta de mercaderías contra Resultado del ejercicio', action: 'debit' }
      ]
    },
    { 
      code: '701', 
      name: 'Venta de productos terminados', 
      scenarios: [
        { text: 'Al realizar la venta (Ej: panadería vende sus barras de pan a tiendas)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Venta de productos terminados', action: 'debit' }
      ]
    },
    { 
      code: '704', 
      name: 'Venta de envases y embalajes', 
      scenarios: [
        { text: 'Al vender los envases (Ej: venta de palets usados a otra empresa)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Venta de envases', action: 'debit' }
      ]
    },
    { 
      code: '705', 
      name: 'Prestación de servicios', 
      scenarios: [
        { text: 'Al facturar el servicio (Ej: cobro por asesorar a otra empresa en logística)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Prestación de servicios', action: 'debit' }
      ]
    },
    { 
      code: '706', 
      name: 'Descuentos sobre ventas por pronto pago', 
      scenarios: [
        { text: 'Al conceder el descuento (Ej: rebaja al cliente por pagarnos al contado)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Descuentos sobre ventas por pronto pago', action: 'credit' }
      ]
    },
    { 
      code: '708', 
      name: 'Devoluciones de ventas y operaciones similares', 
      scenarios: [
        { text: 'Al recibir mercancía devuelta (Ej: cliente nos devuelve fruta por no ser el calibre pactado)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Devoluciones de ventas', action: 'credit' }
      ]
    },
    { 
      code: '709', 
      name: '«Rappels» sobre ventas', 
      scenarios: [
        { text: 'Al conceder el abono por volumen (Ej: descuento al cliente por comprarnos más de 50 toneladas)', action: 'debit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Rappels sobre ventas', action: 'credit' }
      ]
    },
    { 
      code: '752', 
      name: 'Ingresos por arrendamientos', 
      scenarios: [
        { text: 'Al facturar el alquiler (Ej: cobro mensual por alquilar una oficina que nos sobra)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Ingresos por arrendamientos', action: 'debit' }
      ]
    },
    { 
      code: '754', 
      name: 'Ingresos por comisiones', 
      scenarios: [
        { text: 'Al devengar la comisión (Ej: cobro por mediar en una venta entre terceros)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Ingresos por comisiones', action: 'debit' }
      ]
    },
    { 
      code: '755', 
      name: 'Ingresos por servicios al personal', 
      scenarios: [
        { text: 'Por servicios prestados (Ej: cobro a empleados por el uso del comedor de empresa)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Ingresos por servicios al personal', action: 'debit' }
      ]
    },
    { 
      code: '760', 
      name: 'Ingresos de participaciones en instrumentos de patrimonio', 
      scenarios: [
        { text: 'Al cobrar dividendos (Ej: cobro de beneficios de las acciones que poseemos)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Ingresos de participaciones', action: 'debit' }
      ]
    },
    { 
      code: '766', 
      name: 'Beneficios en participaciones y valores representativos de deuda', 
      scenarios: [
        { text: 'Al vender con beneficio (Ej: venta de acciones por encima de su precio de compra)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Beneficios financieros', action: 'debit' }
      ]
    },
    { 
      code: '769', 
      name: 'Otros ingresos financieros', 
      scenarios: [
        { text: 'Por intereses a nuestro favor (Ej: intereses abonados por el banco en nuestra cuenta)', action: 'credit' },
        { text: 'Al cierre del ejercicio para saldar la cuenta de Otros ingresos financieros', action: 'debit' }
      ]
    }
  ],
  4: [
    { 
      code: '400', 
      name: 'Proveedores', 
      scenarios: [
        { text: 'Al recibir la factura de compra (Ej: compra de fruta a pagar en 30 días)', action: 'credit' },
        { text: 'Al pagar la deuda (Ej: transferencia bancaria al proveedor) de Proveedores', action: 'debit' }
      ]
    },
    { 
      code: '4009', 
      name: 'Proveedores, facturas pendientes de recibir o formalizar', 
      scenarios: [
        { text: 'Al recibir la mercancía sin factura (Ej: llega el camión de fruta pero no el documento de cargo)', action: 'credit' },
        { text: 'Al recibir la factura definitiva de Proveedores, facturas pendientes de recibir o formalizar', action: 'debit' }
      ]
    },
    { 
      code: '401', 
      name: 'Proveedores, efectos comerciales a pagar', 
      scenarios: [
        { text: 'Al aceptar la letra o pagaré (Ej: aceptamos pagaré a 60 días por compra de mercancía)', action: 'credit' },
        { text: 'Al pagar el efecto al vencimiento de Proveedores, efectos comerciales a pagar', action: 'debit' }
      ]
    },
    { 
      code: '406', 
      name: 'Envases y embalajes a devolver a proveedores', 
      scenarios: [
        { text: 'Al recibir envases con facultad de devolución (Ej: recibimos cajas de plástico retornables con la fruta)', action: 'debit' },
        { text: 'Al devolver los envases o decidir quedárselos de Envases y embalajes a devolver a proveedores', action: 'credit' }
      ]
    },
    { 
      code: '407', 
      name: 'Anticipos a proveedores', 
      scenarios: [
        { text: 'Al entregar dinero a cuenta (Ej: pago de 1.000 € antes de recibir el pedido de fruta)', action: 'debit' },
        { text: 'Al recibir la mercancía y aplicar el anticipo de Anticipos a proveedores', action: 'credit' }
      ]
    },
    { 
      code: '410', 
      name: 'Acreedores por prestaciones de servicios', 
      scenarios: [
        { text: 'Al recibir la factura de un servicio (Ej: deuda con la empresa de limpieza o seguridad)', action: 'credit' },
        { text: 'Al pagar la factura de Acreedores por prestaciones de servicios', action: 'debit' }
      ]
    },
    { 
      code: '430', 
      name: 'Clientes', 
      scenarios: [
        { text: 'Al emitir la factura de venta (Ej: venta de fruta a cobrar en 15 días)', action: 'debit' },
        { text: 'Al cobrar la factura (Ej: ingreso en cuenta del pago del cliente) de Clientes', action: 'credit' }
      ]
    },
    { 
      code: '431', 
      name: 'Clientes, efectos comerciales a cobrar', 
      scenarios: [
        { text: 'Al recibir el efecto aceptado (Ej: el cliente nos entrega un pagaré por su compra)', action: 'debit' },
        { text: 'Al cobrar el efecto al vencimiento de Clientes, efectos comerciales a cobrar', action: 'credit' }
      ]
    },
    { 
      code: '434', 
      name: 'Clientes, empresas asociadas', 
      scenarios: [
        { text: 'Al vender a una empresa del mismo grupo (Ej: venta de fruta a una filial de la sociedad) de Clientes, empresas asociadas', action: 'debit' },
        { text: 'Al cobrar la deuda de Clientes, empresas asociadas', action: 'credit' }
      ]
    },
    { 
      code: '438', 
      name: 'Anticipos de clientes', 
      scenarios: [
        { text: 'Al recibir dinero a cuenta (Ej: el cliente nos paga 500 € antes de que le enviemos la fruta) de Anticipos de clientes', action: 'credit' },
        { text: 'Al realizar la venta y aplicar el anticipo de Anticipos de clientes', action: 'debit' }
      ]
    },
    { 
      code: '440', 
      name: 'Deudores', 
      scenarios: [
        { text: 'Por ingresos que no son ventas (Ej: deuda de un tercero por habernos comprado mobiliario usado)', action: 'debit' },
        { text: 'Al cobrar la deuda de Deudores', action: 'credit' }
      ]
    },
    { 
      code: '472', 
      name: 'Hacienda Pública, IVA soportado', 
      scenarios: [
        { text: 'Al comprar bienes o servicios (Ej: IVA del 21 % en la factura de compra de maquinaria)', action: 'debit' },
        { text: 'Al realizar la liquidación trimestral del IVA de Hacienda Pública, IVA soportado', action: 'credit' }
      ]
    },
    { 
      code: '473', 
      name: 'Hacienda Pública, retenciones y pagos a cuenta', 
      scenarios: [
        { text: 'Al recibir un ingreso con retención (Ej: el banco nos retiene IRPF sobre los intereses)', action: 'debit' },
        { text: 'Al liquidar el Impuesto sobre Sociedades de Hacienda Pública, retenciones y pagos a cuenta', action: 'credit' }
      ]
    },
    { 
      code: '477', 
      name: 'Hacienda Pública, IVA repercutido', 
      scenarios: [
        { text: 'Al realizar una venta (Ej: IVA del 4 % en la factura de venta de fruta)', action: 'credit' },
        { text: 'Al realizar la liquidación trimestral del IVA de Hacienda Pública, IVA repercutido', action: 'debit' }
      ]
    }
  ],
  5: [
    { 
      code: '5200', 
      name: 'Préstamos a corto plazo con entidades de crédito', 
      scenarios: [
        { text: 'Al recibir el préstamo (Ej: crédito bancario a devolver en 6 meses)', action: 'credit' },
        { text: 'Al pagar las cuotas o el total de la deuda de Préstamos a corto plazo con entidades de crédito', action: 'debit' }
      ]
    },
    { 
      code: '523', 
      name: 'Proveedores de inmovilizado a corto plazo', 
      scenarios: [
        { text: 'Al comprar el activo (Ej: compra de un ordenador a pagar en 90 días)', action: 'credit' },
        { text: 'Al pagar la deuda de Proveedores de inmovilizado a corto plazo', action: 'debit' }
      ]
    },
    { 
      code: '540', 
      name: 'Inversiones financieras a corto plazo en instrumentos de patrimonio', 
      scenarios: [
        { text: 'Al comprar acciones para especular (Ej: compra de acciones de bolsa para vender en 3 meses)', action: 'debit' },
        { text: 'Al vender las acciones de Inversiones financieras a corto plazo en instrumentos de patrimonio', action: 'credit' }
      ]
    },
    { 
      code: '541', 
      name: 'Valores representativos de deuda a corto plazo', 
      scenarios: [
        { text: 'Al suscribir los títulos (Ej: compra de letras del tesoro a 6 meses)', action: 'debit' },
        { text: 'Al recuperar la inversión de Valores representativos de deuda a corto plazo', action: 'credit' }
      ]
    },
    { 
      code: '542', 
      name: 'Créditos a corto plazo', 
      scenarios: [
        { text: 'Al conceder el préstamo (Ej: dinero prestado a otra empresa a devolver en 8 meses)', action: 'debit' },
        { text: 'Al cobrar el préstamo de Créditos a corto plazo', action: 'credit' }
      ]
    },
    { 
      code: '548', 
      name: 'Imposiciones a corto plazo', 
      scenarios: [
        { text: 'Al abrir el depósito (Ej: imposición a plazo fijo de 4 meses)', action: 'debit' },
        { text: 'Al recuperar los fondos de Imposiciones a corto plazo', action: 'credit' }
      ]
    },
    { 
      code: '558', 
      name: 'Socios por desembolsos exigidos', 
      scenarios: [
        { text: 'Cuando la sociedad pide el dinero (Ej: se exige el pago del 25 % restante de las acciones)', action: 'debit' },
        { text: 'Cuando los socios realizan el ingreso de Socios por desembolsos exigidos', action: 'credit' }
      ]
    },
    { 
      code: '560', 
      name: 'Fianzas recibidas a corto plazo', 
      scenarios: [
        { text: 'Al recibir la garantía (Ej: cobro de fianza por alquiler de equipo para un evento de 1 mes)', action: 'credit' },
        { text: 'Al devolver la fianza de Fianzas recibidas a corto plazo', action: 'debit' }
      ]
    },
    { 
      code: '565', 
      name: 'Fianzas constituidas a corto plazo', 
      scenarios: [
        { text: 'Al entregar la garantía (Ej: pago de fianza por alquilar una furgoneta una semana)', action: 'debit' },
        { text: 'Al recuperar la fianza de Fianzas constituidas a corto plazo', action: 'credit' }
      ]
    },
    { 
      code: '570', 
      name: 'Caja', 
      scenarios: [
        { text: 'Por las entradas de efectivo (Ej: cobro en metálico de una venta menor)', action: 'debit' },
        { text: 'Por los pagos en metálico (Ej: pago de correos o pequeños suministros) de Caja', action: 'credit' }
      ]
    },
    { 
      code: '572', 
      name: 'Bancos', 
      scenarios: [
        { text: 'Por los ingresos en cuenta (Ej: transferencia recibida de un cliente)', action: 'debit' },
        { text: 'Por los pagos por banco (Ej: pago de nóminas o recibos domiciliados) de Bancos', action: 'credit' }
      ]
    },
    { 
      code: '573', 
      name: 'Bancos, moneda extranjera', 
      scenarios: [
        { text: 'Por ingresos en divisas (Ej: cobro en dólares de una venta a EE.UU.)', action: 'debit' },
        { text: 'Por pagos en divisas de Bancos, moneda extranjera', action: 'credit' }
      ]
    }
  ]
};

const ACCOUNT_MAPPING: Record<string, string> = {
  '100': 'Capital Social',
  '101': 'Fondo social',
  '102': 'Capital',
  '103': 'Socios por desembolsos no exigidos',
  '112': 'Reserva legal',
  '129': 'Resultado del ejercicio',
  '170': 'Deudas a largo plazo con entidades de crédito',
  '173': 'Proveedores de inmovilizado a largo plazo',
  '175': 'Efectos a pagar a largo plazo',
  '180': 'Fianzas recibidas a largo plazo',
  '203': 'Propiedad industrial',
  '205': 'Derechos de traspaso',
  '206': 'Aplicaciones informáticas',
  '210': 'Terrenos y bienes naturales',
  '211': 'Construcciones',
  '212': 'Instalaciones técnicas',
  '213': 'Maquinaria',
  '214': 'Utillaje',
  '215': 'Otras instalaciones',
  '216': 'Mobiliario',
  '217': 'Equipos para procesos de información',
  '218': 'Elementos de transporte',
  '219': 'Otro inmovilizado material',
  '240': 'Participaciones a largo plazo en partes vinculadas',
  '241': 'Valores representativos de deuda a largo plazo con partes vinculadas',
  '250': 'Participaciones a largo plazo',
  '251': 'Valores representativos de deuda a largo plazo',
  '252': 'Créditos a largo plazo',
  '258': 'Imposiciones a largo plazo',
  '300': 'Mercaderías',
  '310': 'Materias primas',
  '320': 'Otros aprovisionamientos',
  '400': 'Proveedores',
  '4009': 'Proveedores, facturas pendientes de recibir o formalizar',
  '401': 'Proveedores, efectos comerciales a pagar',
  '403': 'Proveedores, empresas del grupo',
  '404': 'Proveedores, empresas asociadas',
  '405': 'Proveedores, otras partes vinculadas',
  '406': 'Envases y embalajes a devolver a proveedores',
  '407': 'Anticipos a proveedores',
  '410': 'Acreedores por prestaciones de servicios',
  '430': 'Clientes',
  '431': 'Clientes, efectos comerciales a cobrar',
  '433': 'Clientes, empresas del grupo',
  '434': 'Clientes, empresas asociadas',
  '435': 'Clientes, otras partes vinculadas',
  '438': 'Anticipos de clientes',
  '440': 'Deudores',
  '472': 'Hacienda Pública, IVA soportado',
  '473': 'Hacienda Pública, retenciones y pagos a cuenta',
  '477': 'Hacienda Pública, IVA repercutido',
  '5200': 'Préstamos a corto plazo con entidades de crédito',
  '523': 'Proveedores de inmovilizado a corto plazo',
  '540': 'Inversiones financieras a corto plazo en instrumentos de patrimonio',
  '541': 'Valores representativos de deuda a corto plazo',
  '542': 'Créditos a corto plazo',
  '548': 'Imposiciones a corto plazo',
  '558': 'Socios por desembolsos exigidos',
  '560': 'Fianzas recibidas a corto plazo',
  '565': 'Fianzas constituidas a corto plazo',
  '570': 'Caja',
  '572': 'Bancos',
  '573': 'Bancos, moneda extranjera',
  '600': 'Compra de mercaderías',
  '601': 'Compra de materias primas',
  '602': 'Compras de otros aprovisionamientos',
  '606': 'Descuentos sobre compras por pronto pago',
  '608': 'Devoluciones de compras y operaciones similares',
  '609': '«Rappels» por compras',
  '610': 'Variación de existencias de mercaderías',
  '620': 'Gastos en investigación y desarrollo del ejercicio',
  '621': 'Arrendamientos y cánones',
  '622': 'Reparaciones y conservación',
  '623': 'Servicios de profesionales independientes',
  '624': 'Transportes',
  '625': 'Primas de seguros',
  '626': 'Servicios bancarios y similares',
  '628': 'Suministros',
  '629': 'Otros servicios',
  '650': 'Pérdidas de créditos comerciales incobrables',
  '662': 'Intereses de deudas',
  '666': 'Pérdidas en participaciones y valores representativos de deuda',
  '678': 'Gastos excepcionales',
  '700': 'Venta de mercaderías',
  '701': 'Venta de productos terminados',
  '704': 'Venta de envases y embalajes',
  '705': 'Prestación de servicios',
  '706': 'Descuentos sobre ventas por pronto pago',
  '708': 'Devoluciones de ventas y operaciones similares',
  '709': '«Rappels» sobre ventas',
  '752': 'Ingresos por arrendamientos',
  '754': 'Ingresos por comisiones',
  '755': 'Ingresos por servicios al personal',
  '760': 'Ingresos de participaciones en instrumentos de patrimonio',
  '766': 'Beneficios en participaciones y valores representativos de deuda',
  '769': 'Otros ingresos financieros'
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
    equity: [{ name: 'Capital Social', amount: 200000, code: '100' }],
    nonCurrent: [{ name: 'Deudas a largo plazo con entidades de crédito', amount: 10000, code: '170' }],
    current: [{ name: 'Préstamos a corto plazo con entidades de crédito', amount: 25000, code: '5200' }]
  }
};

const categorizeAccount = (code: string): { section: 'assets' | 'liabilitiesAndEquity', subSection: 'nonCurrent' | 'current' | 'equity' } | null => {
  if (!code) return null;
  const firstDigit = code[0];
  const prefix2 = code.substring(0, 2);

  // Group 1: Financiación básica
  if (firstDigit === '1') {
    if (['10', '11', '12', '13', '19'].includes(prefix2)) return { section: 'liabilitiesAndEquity', subSection: 'equity' };
    return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
  }

  // Group 2: Inmovilizado
  if (firstDigit === '2') return { section: 'assets', subSection: 'nonCurrent' };

  // Group 3: Existencias
  if (firstDigit === '3') return { section: 'assets', subSection: 'current' };

  // Group 4: Acreedores y deudores
  if (firstDigit === '4') {
    if (code === '474') return { section: 'assets', subSection: 'nonCurrent' };
    if (code === '479') return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
    if (code === '407') return { section: 'assets', subSection: 'current' };
    if (code === '438') return { section: 'liabilitiesAndEquity', subSection: 'current' };
    
    // Liabilities: 40, 41, 46, 475, 476, 477, 485
    if (['40', '41', '46'].includes(prefix2) || ['475', '476', '477', '485'].includes(code.substring(0, 3))) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }
    // Assets: 43, 44, 470, 471, 472, 473, 480
    return { section: 'assets', subSection: 'current' };
  }

  // Group 5: Cuentas financieras
  if (firstDigit === '5') {
    // Liabilities: 50, 51, 52, 55, 560, 561
    if (['50', '51', '52', '55'].includes(prefix2) || code.startsWith('560') || code.startsWith('561')) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }
    // Assets: 53, 54, 57, 58, 565, 566
    return { section: 'assets', subSection: 'current' };
  }

  // Group 6 & 7: PnL
  if (firstDigit === '6' || firstDigit === '7') return { section: 'liabilitiesAndEquity', subSection: 'equity' };

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
    if (code.startsWith('49')) return true;
    
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
  const [isDigitalWhiteboardOpen, setIsDigitalWhiteboardOpen] = useState(false);
  const [whiteboardPages, setWhiteboardPages] = useState<any[]>([{ shapes: [], scale: 1, position: { x: 0, y: 0 } }]);
  const [whiteboardCurrentPageIndex, setWhiteboardCurrentPageIndex] = useState(0);
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
  const [gameQuestionType, setGameQuestionType] = useState<'code' | 'balance' | 'entry' | 'section'>('code');
  const [userEntryChoice, setUserEntryChoice] = useState<'debit' | 'credit' | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [currentScenario, setCurrentScenario] = useState<{ text: string, action: 'debit' | 'credit' } | null>(null);
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
  const [missedQuestions, setMissedQuestions] = useState<{
    question: string;
    code: string;
    correctAnswer: string;
    userAnswer: string;
    type: string;
  }[]>([]);
  
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
      whiteboardPages,
      whiteboardCurrentPageIndex,
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
        if (data.whiteboardPages) {
          // Migration: if pages are arrays (old format), convert to objects (new format)
          const migratedPages = data.whiteboardPages.map((page: any) => {
            if (Array.isArray(page)) {
              return { shapes: page, scale: 1, position: { x: 0, y: 0 } };
            }
            return page;
          });
          setWhiteboardPages(migratedPages);
        }
        if (data.whiteboardCurrentPageIndex !== undefined) setWhiteboardCurrentPageIndex(data.whiteboardCurrentPageIndex);
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
    // Font scales and layout are now preserved
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
  }, [messages, currentBalance, currentJournal, fontScale, balanceFontScale, journalFontScale, pizarraColumns, pizarraSplit, whiteboardPages, whiteboardCurrentPageIndex]);

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

  const getAccountBalanceSection = (code: string): string => {
    if (code.startsWith('6') || code.startsWith('7')) return 'Patrimonio neto';
    
    const category = categorizeAccount(code);
    if (!category) return 'Activo corriente';

    if (category.section === 'assets') {
      return category.subSection === 'nonCurrent' ? 'Activo no corriente' : 'Activo corriente';
    } else {
      if (category.subSection === 'equity') return 'Patrimonio neto';
      return category.subSection === 'nonCurrent' ? 'Pasivo no corriente' : 'Pasivo corriente';
    }
  };

  const getCorrectBalances = (code: string): string[] => {
    const firstDigit = code[0];
    const results = ['Saldo nulo'];

    // Special cases (can be both)
    if (['129', '610', '477'].includes(code)) {
      results.push('Saldo deudor', 'Saldo acreedor');
      return results;
    }

    // Deudor balance (Assets and Expenses)
    // Note: accounts with "Signo: Negativo" in Pasivo/Equity are Deudor
    // accounts with "Signo: Positivo" in Activo are Deudor
    const isDeudor = 
      firstDigit === '2' || 
      firstDigit === '3' || 
      (firstDigit === '6' && !['606', '608', '609', '610'].includes(code)) ||
      ['706', '708', '709'].includes(code) ||
      ['430', '431', '434', '440', '472', '473'].includes(code) ||
      ['406', '407'].includes(code) || // Negative in Pasivo
      ['540', '541', '542', '548', '558', '565', '570', '572', '573'].includes(code) ||
      ['103'].includes(code); // Negative in Equity

    // Acreedor balance (Liabilities, Equity and Income)
    // Note: accounts with "Signo: Negativo" in Activo are Acreedor
    // accounts with "Signo: Positivo" in Pasivo are Acreedor
    const isAcreedor = 
      (firstDigit === '1' && !['103', '129'].includes(code)) ||
      (firstDigit === '7' && !['706', '708', '709'].includes(code)) ||
      ['606', '608', '609'].includes(code) ||
      ['400', '4009', '401', '410'].includes(code) ||
      ['438'].includes(code) || // Negative in Activo
      ['5200', '523'].includes(code) ||
      ['560'].includes(code); // Negative in Activo

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
    const accounts: { code: string, name: string, examples?: string[], scenarios?: { text: string, action: 'debit' | 'credit' }[] }[] = [];
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
    
    // Decide question type first to ensure distribution
    let type: 'code' | 'balance' | 'entry' | 'section' = 'code';
    const rand = Math.random();
    
    let randomAccount;
    
    // 50% chance for 'entry' questions
    if (rand > 0.5) {
      const accountsWithScenarios = availableAccounts.filter(a => a.scenarios && a.scenarios.length > 0);
      if (accountsWithScenarios.length > 0) {
        type = 'entry';
        randomAccount = accountsWithScenarios[Math.floor(Math.random() * accountsWithScenarios.length)];
      } else {
        // Fallback if no accounts with scenarios are left in the pool
        const subRand = Math.random();
        if (subRand < 0.33) type = 'code';
        else if (subRand < 0.66) type = 'balance';
        else type = 'section';
        randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
      }
    } else {
      // Distribution for other types (approx 16.6% each)
      const subRand = Math.random();
      if (subRand < 0.33) type = 'code';
      else if (subRand < 0.66) type = 'balance';
      else type = 'section';
      randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    }

    setCurrentQuestion(randomAccount);
    setAskedQuestionCodes(prev => {
      if (availableAccounts.length === accounts.length && prev.length > 0) {
        return [randomAccount.code];
      }
      return [...prev, randomAccount.code];
    });
    
    setGameQuestionType(type);
    setUserAnswer('');
    setSelectedBalances([]);
    setSelectedSection(null);
    setUserEntryChoice(null);
    setCurrentScenario(null);
    setLastAnswerCorrect(null);
    
    const difficultyTimes = {
      facil: 30,
      normal: 20,
      extremo: 10
    };
    setGameTimer(difficultyTimes[gameDifficulty]);
    
    // Pick question text
    if (type === 'entry' && randomAccount.scenarios) {
      const scenario = randomAccount.scenarios[Math.floor(Math.random() * randomAccount.scenarios.length)];
      setCurrentScenario(scenario);
      setCurrentQuestionText(`CASO: ${scenario.text}`);
    } else if (type === 'code') {
      if (randomAccount.examples && randomAccount.examples.length > 0) {
        const example = randomAccount.examples[Math.floor(Math.random() * randomAccount.examples.length)];
        setCurrentQuestionText(`EJEMPLO: ${example}`);
      } else {
        setCurrentQuestionText(`CUENTA: ${randomAccount.name}`);
      }
    } else {
      setCurrentQuestionText(randomAccount.name);
    }
  };

  const handleWrongAnswer = (message?: string) => {
    setGameLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setTimeout(() => {
          setGameStatus('gameover');
          setPlayerName('');
          setIsScoreSaved(false);
        }, 1500); // Show the loss for a moment
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
      if (gameStatus === 'playing' && gameLives > 1) {
        generateQuestion();
      }
    }, 2000); // Increased delay to show the error state
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
    setMissedQuestions([]);
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
        setMissedQuestions(prev => [...prev, {
          question: currentQuestionText || currentQuestion.name,
          code: currentQuestion.code,
          correctAnswer: currentQuestion.code,
          userAnswer: userAnswer.trim(),
          type: 'Código de cuenta'
        }]);
        handleWrongAnswer();
      }
    } else if (gameQuestionType === 'entry') {
      const isCodeCorrect = userAnswer.trim() === currentQuestion.code;
      const isActionCorrect = userEntryChoice === currentScenario?.action;

      if (isCodeCorrect && isActionCorrect) {
        setGameScore(prev => prev + 20); // Higher reward for complex question
        setLastAnswerCorrect(true);
        setTimeout(() => {
          generateQuestion();
        }, 1000);
      } else {
        let msg = "";
        if (!isCodeCorrect && !isActionCorrect) msg = "Código y acción incorrectos";
        else if (!isCodeCorrect) msg = "Código de cuenta incorrecto";
        else msg = "La cuenta debe " + (currentScenario?.action === 'debit' ? "cargarse (Debe)" : "abonarse (Haber)");
        
        setMissedQuestions(prev => [...prev, {
          question: currentQuestionText,
          code: currentQuestion.code,
          correctAnswer: `${currentQuestion.code} (${currentScenario?.action === 'debit' ? 'Debe' : 'Haber'})`,
          userAnswer: `${userAnswer.trim()} (${userEntryChoice === 'debit' ? 'Debe' : userEntryChoice === 'credit' ? 'Haber' : '?'})`,
          type: 'Asiento contable'
        }]);
        handleWrongAnswer(msg);
      }
    } else if (gameQuestionType === 'section') {
      const correct = getAccountBalanceSection(currentQuestion.code);
      if (selectedSection === correct) {
        setGameScore(prev => prev + 12);
        setLastAnswerCorrect(true);
        setTimeout(() => {
          generateQuestion();
        }, 1000);
      } else {
        setMissedQuestions(prev => [...prev, {
          question: `${currentQuestion.code} - ${currentQuestion.name}`,
          code: currentQuestion.code,
          correctAnswer: correct,
          userAnswer: selectedSection || 'Sin respuesta',
          type: 'Sección del balance'
        }]);
        handleWrongAnswer(`Incorrecto. La sección correcta es: ${correct}`);
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
        setMissedQuestions(prev => [...prev, {
          question: `${currentQuestion.code} - ${currentQuestion.name}`,
          code: currentQuestion.code,
          correctAnswer: correct.join(', '),
          userAnswer: selectedBalances.length > 0 ? selectedBalances.join(', ') : 'Sin respuesta',
          type: 'Saldos posibles'
        }]);
        handleWrongAnswer(`Incorrecto. Los saldos correctos son: ${correct.join(', ')}`);
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
                      checked={gameSelectedModules.length === 5}
                      onChange={() => {
                        if (gameSelectedModules.length === 5) setGameSelectedModules([]);
                        else setGameSelectedModules([1, 2, 3, 4, 5]);
                      }}
                    />
                  </label>

                  <div className="h-px bg-zinc-100 my-2" />

                  {[1, 2, 3, 4, 5].map(m => (
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
                              {entry.modules.length === 5 ? 'Contabilidad Financiera I' : `Módulos: ${entry.modules.join(', ')}`}
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
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-zinc-100 text-center space-y-10 relative overflow-hidden">
                {/* Heart Break Animation */}
                <AnimatePresence>
                  {lastAnswerCorrect === false && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
                    >
                      <div className="relative w-32 h-32">
                        {/* Left half of the heart */}
                        <motion.div
                          initial={{ x: 0, rotate: 0, opacity: 1 }}
                          animate={{ x: -40, rotate: -25, y: 20, opacity: 0 }}
                          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Heart className="w-32 h-32 text-red-500 fill-red-500" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }} />
                        </motion.div>
                        {/* Right half of the heart */}
                        <motion.div
                          initial={{ x: 0, rotate: 0, opacity: 1 }}
                          animate={{ x: 40, rotate: 25, y: 20, opacity: 0 }}
                          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Heart className="w-32 h-32 text-red-500 fill-red-500" style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)' }} />
                        </motion.div>
                        {/* Initial full heart pop then disappear */}
                        <motion.div
                          initial={{ scale: 0, opacity: 1 }}
                          animate={{ scale: [0, 1.2, 1], opacity: [1, 1, 0] }}
                          transition={{ 
                            scale: { duration: 0.3 },
                            opacity: { delay: 0.3, duration: 0.01 }
                          }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Heart className="w-32 h-32 text-red-500 fill-red-500" />
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-4">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-[0.3em]">
                    {gameQuestionType === 'code' ? '¿Cuál es el número de cuenta?' : 
                     gameQuestionType === 'entry' ? 'Indica el número de cuenta y si se carga o abona' :
                     gameQuestionType === 'section' ? '¿Dónde figura esta cuenta en el balance?' :
                     '¿Qué saldos puede tener esta cuenta?'}
                  </span>
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="text-4xl font-black text-zinc-900 leading-tight">
                      {gameQuestionType === 'balance' || gameQuestionType === 'section' ? `${currentQuestion.code} - ${currentQuestion.name}` : currentQuestionText}
                    </h3>
                  </div>
                </div>

                <form onSubmit={handleGameAnswer} className="space-y-6">
                  {gameQuestionType === 'code' || gameQuestionType === 'entry' ? (
                    <div className="space-y-8">
                      <div className="relative">
                        <input 
                          autoFocus
                          type="text"
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                          placeholder="Código de cuenta..."
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

                      {gameQuestionType === 'entry' && (
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setUserEntryChoice('debit')}
                            className={`py-6 rounded-2xl border-4 font-black text-xl transition-all ${
                              userEntryChoice === 'debit'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200'
                            }`}
                          >
                            CARGA (DEBE)
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserEntryChoice('credit')}
                            className={`py-6 rounded-2xl border-4 font-black text-xl transition-all ${
                              userEntryChoice === 'credit'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200'
                            }`}
                          >
                            ABONA (HABER)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : gameQuestionType === 'section' ? (
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        'Activo no corriente',
                        'Activo corriente',
                        'Patrimonio neto',
                        'Pasivo no corriente',
                        'Pasivo corriente'
                      ].map(section => (
                        <button
                          key={section}
                          type="button"
                          onClick={() => setSelectedSection(section)}
                          className={`p-5 rounded-2xl border-4 font-bold text-xl transition-all flex items-center justify-between ${
                            selectedSection === section
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-zinc-100 bg-zinc-50 text-zinc-500 hover:border-zinc-200'
                          }`}
                        >
                          {section}
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedSection === section ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'
                          }`}>
                            {selectedSection === section && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                        </button>
                      ))}
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
                    disabled={
                      (gameQuestionType === 'balance' && selectedBalances.length === 0) ||
                      (gameQuestionType === 'section' && !selectedSection) ||
                      (gameQuestionType === 'entry' && (!userAnswer.trim() || !userEntryChoice))
                    }
                    className="w-full py-5 bg-zinc-900 text-white rounded-[1.5rem] font-black text-xl shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                  >
                    {gameQuestionType === 'balance' || gameQuestionType === 'section' ? 'CONFIRMAR SELECCIÓN' : 'COMPROBAR'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {gameStatus === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`${isScoreSaved && missedQuestions.length > 0 ? 'max-w-xl' : 'max-w-md'} mx-auto w-full transition-all duration-500`}
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
                  <div className="space-y-6">
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-2 text-emerald-700 font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                      ¡Puntuación guardada!
                    </div>

                    {missedQuestions.length > 0 && (
                      <div className="space-y-4 text-left">
                        <div className="flex items-center gap-2 px-2">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Repaso de errores</h4>
                        </div>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-200">
                          {missedQuestions.map((q, i) => (
                            <div key={i} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-2">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{q.type}</span>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">#{q.code}</span>
                              </div>
                              <p className="text-sm font-bold text-zinc-800 leading-tight">{q.question}</p>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div>
                                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest block">Tu respuesta</span>
                                  <span className="text-xs font-medium text-red-600 line-clamp-2">{q.userAnswer}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest block">Correcta</span>
                                  <span className="text-xs font-bold text-emerald-700 line-clamp-2">{q.correctAnswer}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
              onClick={() => saveSession()}
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
                    
                    <div className="p-6 space-y-6 pizarra-journal-container flex-1 overflow-y-auto">
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
                            <div className="text-zinc-400">Total: <span className="text-emerald-500">{formatCurrency(draft.reduce((acc, r) => acc + (parseFloat(r.debe) || 0), 0))}</span></div>
                            <div className="text-zinc-400">Total: <span className="text-emerald-500">{formatCurrency(draft.reduce((acc, r) => acc + (parseFloat(r.haber) || 0), 0))}</span></div>
                          </div>
                          <button 
                            onClick={applyManualEntry}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 transition-all"
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
                                  {row.code && <span className="text-[12px] opacity-80 mr-4 font-black text-emerald-500">{row.code}</span>}
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

                      {/* Pizarra Digital Button at the end of Journal */}
                      <div className="pt-4 flex justify-center">
                        <button 
                          onClick={() => setIsDigitalWhiteboardOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-900/20 group"
                          title="Activar Pizarra Digital"
                        >
                          <Monitor className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-bold uppercase tracking-wider">Pizarra Digital</span>
                        </button>
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
                                  {row.code && <span className="text-[12px] opacity-80 mr-4 font-black text-emerald-500">{row.code}</span>}
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

      {/* Digital Whiteboard Overlay */}
      <AnimatePresence>
        {isDigitalWhiteboardOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[200]"
          >
            <DigitalWhiteboard 
              entries={currentJournal} 
              onClose={() => setIsDigitalWhiteboardOpen(false)} 
              pages={whiteboardPages}
              setPages={setWhiteboardPages}
              currentPageIndex={whiteboardCurrentPageIndex}
              setCurrentPageIndex={setWhiteboardCurrentPageIndex}
              formatCurrency={formatCurrency}
            />
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
