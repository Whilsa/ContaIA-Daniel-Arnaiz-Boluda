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
  Type,
  Minus,
  Columns,
  Layout,
  GripVertical,
  Heart,
  Trophy,
  History,
  Monitor,
  Globe,
  Clock,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DigitalWhiteboard } from './components/DigitalWhiteboard';
import ChatAssistant from './components/ChatAssistant';

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
        { text: 'A la compra (Ej: empresa adquiere acciones de una firma) de Participaciones a largo plazo', action: 'debit' },
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

const ACCOUNT_MAPPING_EN: Record<string, string> = {
  '10': 'Capital',
  '11': 'Reserves and other equity instruments',
  '12': 'Profit/Loss pending distribution or application',
  '13': 'Grants, donations and valuation adjustments',
  '14': 'Provisions',
  '15': 'Non-current payables of a special nature',
  '16': 'Non-current payables to related parties',
  '17': 'Non-current payables for loans, debentures and other',
  '18': 'Non-current guarantees, deposits and other liabilities',
  '19': 'Temporary financing',
  '20': 'Intangible assets',
  '21': 'Property, plant and equipment',
  '22': 'Investment property',
  '23': 'Property, plant and equipment under construction',
  '24': 'Non-current investments in related parties',
  '25': 'Other non-current investments',
  '26': 'Non-current guarantees and deposits extended',
  '28': 'Accumulated amortisation and depreciation',
  '29': 'Impairment of non-current assets',
  '30': 'Goods for resale',
  '31': 'Raw materials',
  '32': 'Other supplies',
  '33': 'Work in progress',
  '34': 'Semi-finished goods',
  '35': 'Finished goods',
  '36': 'By-products, waste and recovered materials',
  '39': 'Impairment of inventories',
  '40': 'Suppliers',
  '41': 'Other payables',
  '43': 'Trade receivables',
  '44': 'Other receivables',
  '46': 'Personnel',
  '47': 'Public entities',
  '48': 'Prepaid expenses and deferred income',
  '49': 'Impairment of trade receivables and current provisions',
  '50': 'Current debentures, payables of a special nature and similar issuances',
  '51': 'Current payables to related parties',
  '52': 'Current payables for loans and other',
  '53': 'Current investments in related parties',
  '54': 'Other current investments',
  '55': 'Accounts other than bank accounts',
  '56': 'Current guarantees, deposits, prepaid expenses and deferred income',
  '57': 'Cash',
  '58': 'Non-current assets held for sale and associated assets and liabilities',
  '59': 'Impairment of current investments and non-current assets held for sale',
  '60': 'Purchases',
  '61': 'Changes in inventories',
  '62': 'External services',
  '63': 'Taxes',
  '64': 'Personnel expenses',
  '65': 'Other expenses',
  '66': 'Finance expenses',
  '67': 'Losses on non-current assets and exceptional expenses',
  '68': 'Amortisation and depreciation',
  '69': 'Impairment losses and other charges',
  '70': 'Sales of merchandise, work carried out by the company for assets, services, etc.',
  '71': 'Changes in inventories',
  '73': 'Work carried out by the company for assets',
  '74': 'Grants, donations and bequests',
  '75': 'Other income',
  '76': 'Finance income',
  '77': 'Gains on non-current assets and exceptional income',
  '79': 'Surplus and use of provisions and impairment losses',
  '100': 'Share capital',
  '101': 'Assigned capital',
  '102': 'Capital',
  '103': 'Uncalled capital',
  '104': 'Uncalled non-monetary contributions',
  '108': 'Own shares or equity holdings in special situations',
  '109': 'Own shares or equity holdings for reduction of capital',
  '110': 'Share premium or additional paid-in capital',
  '111': 'Other equity instruments',
  '112': 'Legal reserve',
  '113': 'Voluntary reserves',
  '114': 'Special reserves',
  '115': 'Reserves for actuarial gains and losses and other adjustments',
  '118': 'Contributions from equity holders or owners',
  '119': 'Differences on translation of capital to euros',
  '120': 'Retained earnings',
  '121': 'Prior periods’ losses',
  '129': 'Profit/loss for the period',
  '130': 'Government capital grants',
  '131': 'Capital donations and bequests',
  '132': 'Valuation adjustments to available-for-sale financial assets',
  '133': 'Valuation adjustments to available-for-sale financial assets',
  '134': 'Hedging transactions',
  '135': 'Translation differences',
  '136': 'Valuation adjustments to non-current assets and disposal groups held for sale',
  '137': 'Deferred tax income for tax deductions and credits',
  '140': 'Provisions for long-term employee benefits',
  '141': 'Provision for taxes',
  '142': 'Provision for other liabilities',
  '143': 'Provision for dismantlement, removal or restoration of fixed assets',
  '145': 'Provision for environmental actions',
  '146': 'Provision for restructuring costs',
  '147': 'Provisions for share-based payment transactions',
  '150': 'Non-current liability-classified shares or equity holdings',
  '153': 'Liability-classified uncalled share capital or equity holdings',
  '154': 'Liability-classified uncalled non-monetary contributions',
  '160': 'Non-current debt with related financial institutions',
  '161': 'Non-current payables to suppliers of fixed assets, related parties',
  '162': 'Non-current finance leases payables, related parties',
  '163': 'Other non-current payables to related parties',
  '170': 'Non-current debt with financial institutions',
  '171': 'Non-current payables',
  '172': 'Non-current payables convertible into grants, donations and bequests',
  '173': 'Non-current payables to suppliers of fixed assets',
  '174': 'Non-current finance lease payables',
  '175': 'Non-current bills payable',
  '176': 'Non-current liabilities arising from derivative financial instruments',
  '177': 'Bonds and obligations',
  '178': 'Convertible bonds and obligations',
  '179': 'Other marketable securities',
  '180': 'Non-current guarantees received',
  '181': 'Advances of long-term sales',
  '185': 'Non-current deposits received',
  '189': 'Non-current financial guarantees',
  '190': 'Shares or equity holdings issued',
  '192': 'Subscribed shares',
  '194': 'Issued capital pending registration',
  '195': 'Liability-classified shares or equity holdings issued',
  '197': 'Liability-classified subscribed shares',
  '199': 'Liability-classified shares or equity holdings issued pending registration',
  '200': 'Research',
  '201': 'Development',
  '202': 'Administrative concessions',
  '203': 'Industrial property',
  '204': 'Goodwill',
  '205': 'Leaseholds',
  '206': 'Computer software',
  '209': 'Advances for intangible assets',
  '210': 'Land and natural resources',
  '211': 'Buildings',
  '212': 'Technical installations',
  '213': 'Machinery',
  '214': 'Equipment',
  '215': 'Other installations',
  '216': 'Furniture',
  '217': 'Information technology equipment',
  '218': 'Motor vehicles',
  '219': 'Other property, plant and equipment',
  '220': 'Investments in land and natural resources',
  '221': 'Investments in buildings',
  '230': 'Preparation of land and natural resources',
  '231': 'Buildings under construction',
  '232': 'Technical installations under assembly',
  '233': 'Machinery under assembly',
  '237': 'Information technology equipment under assembly',
  '239': 'Advances for property, plant and equipment',
  '240': 'Non-current investments in related parties',
  '241': 'Non-current debt securities of related parties',
  '242': 'Non-current loans to related parties',
  '249': 'Non-current uncalled equity holdings in related parties',
  '250': 'Non-current investments in equity instruments',
  '251': 'Non-current debt securities',
  '252': 'Non-current loans',
  '253': 'Non-current loans for disposal of fixed assets',
  '254': 'Non-current loans for personnel',
  '255': 'Non-current assets arising from derivative financial instruments',
  '257': 'Reimbursement rights of insurance contracts for long-term employee benefits',
  '258': 'Non-current deposits',
  '259': 'Non-current uncalled equity holdings',
  '260': 'Non-current guarantees extended',
  '265': 'Non-current deposits extended',
  '280': 'Accumulated amortisation of intangible assets',
  '281': 'Accumulated amortisation of property, plant and equipment',
  '282': 'Accumulated amortisation of investment property',
  '290': 'Impairment of intangible assets',
  '291': 'Impairment of property, plant and equipment',
  '292': 'Impairment of investment property',
  '293': 'Impairment of non-current investments in related parties',
  '294': 'Impairment of non-current debt securities of related parties',
  '295': 'Impairment of non-current loans to related parties',
  '297': 'Impairment of non-current debt securities',
  '298': 'Impairment of non-current loans',
  '300': 'Merchandise A',
  '301': 'Merchandise B',
  '310': 'Raw materials A',
  '311': 'Raw materials B',
  '320': 'Components',
  '321': 'Fuel',
  '322': 'Spare parts',
  '325': 'Sundry materials',
  '326': 'Packaging',
  '327': 'Containers',
  '328': 'Office supplies',
  '330': 'Work in progress A',
  '331': 'Work in progress B',
  '350': 'Finished goods A',
  '351': 'Finished goods B',
  '360': 'By-products A',
  '361': 'By-products B',
  '365': 'Waste A',
  '366': 'Waste B',
  '368': 'Recovered materials A',
  '369': 'Recovered materials B',
  '390': 'Impairment of merchandise',
  '391': 'Impairment of raw materials',
  '392': 'Impairment of other supplies',
  '393': 'Impairment of work in progress',
  '394': 'Impairment of semi-finished goods',
  '395': 'Impairment of finished goods',
  '396': 'Impairment of by-products, waste and recovered materials',
  '400': 'Suppliers',
  '401': 'Suppliers, trade bills payable',
  '403': 'Suppliers, group companies',
  '404': 'Suppliers, associates',
  '405': 'Suppliers, other related parties',
  '406': 'Containers and packaging returnable to suppliers',
  '407': 'Advances to suppliers',
  '410': 'Payables for the rendering of services',
  '411': 'Trade bills payable',
  '419': 'Payables for profit-sharing agreements',
  '430': 'Trade receivables',
  '431': 'Trade receivables, trade bills receivable',
  '432': 'Trade receivables, factoring',
  '433': 'Trade receivables, group companies',
  '434': 'Trade receivables, associates',
  '435': 'Trade receivables, other related parties',
  '436': 'Doubtful trade receivables',
  '437': 'Containers and packaging returnable by customers',
  '438': 'Advances from customers',
  '440': 'Receivables',
  '441': 'Receivables, trade bills',
  '446': 'Doubtful receivables',
  '449': 'Receivables for profit-sharing agreements',
  '460': 'Salary advances',
  '465': 'Salaries payable',
  '466': 'Employee benefits payable through defined contribution schemes',
  '470': 'Taxation authorities, receivables',
  '471': 'Social Security, receivables',
  '472': 'Input VAT',
  '473': 'Withholdings and payments on account',
  '474': 'Deferred tax assets',
  '475': 'Taxation authorities, taxes payable',
  '476': 'Social Security, payables',
  '477': 'Output VAT',
  '479': 'Liabilities arising from taxable temporary differences',
  '480': 'Prepaid expenses',
  '485': 'Deferred income',
  '490': 'Impairment of trade receivables',
  '493': 'Impairment of trade receivables from related parties',
  '499': 'Trade provisions',
  '500': 'Current bonds and obligations',
  '501': 'Current convertible bonds and obligations',
  '502': 'Current liability-classified shares or equity holdings',
  '505': 'Other current marketable securities',
  '506': 'Current interest on debentures and similar issues',
  '507': 'Dividends payable on liability-classified instruments',
  '509': 'Redeemed marketable securities',
  '510': 'Current debt with related financial institutions',
  '511': 'Current payables to suppliers of fixed assets, related parties',
  '512': 'Current finance lease payables, related parties',
  '513': 'Other current payables to related parties',
  '514': 'Current interest on payables to related parties',
  '520': 'Current debt with financial institutions',
  '521': 'Current payables',
  '522': 'Current payables convertible into grants, donations and bequests',
  '523': 'Current payables to suppliers of fixed assets',
  '524': 'Current finance lease payables',
  '525': 'Current bills payable',
  '526': 'Dividend payable',
  '527': 'Current interest on debt with financial institutions',
  '528': 'Current interest on payables',
  '529': 'Current provisions',
  '530': 'Current investments in related parties',
  '531': 'Current debt securities of related parties',
  '532': 'Current loans to related parties',
  '533': 'Current interest on debt securities of related parties',
  '534': 'Current interest on loans to related parties',
  '535': 'Dividend receivable on investments in related parties',
  '539': 'Current uncalled equity holdings in related parties',
  '540': 'Current investments in equity instruments',
  '541': 'Current debt securities',
  '542': 'Current loans',
  '543': 'Current loans for disposal of fixed assets',
  '544': 'Current loans to personnel',
  '545': 'Dividend receivable',
  '546': 'Current interest on debt securities',
  '547': 'Current interest on loans',
  '548': 'Current deposits',
  '549': 'Current uncalled equity holdings',
  '550': 'Current account with owner',
  '551': 'Current account with equity holders and directors',
  '552': 'Current account with other individuals and related entities',
  '553': 'Current accounts in mergers and spin-offs',
  '554': 'Current account with temporary joint ventures and co-ownerships',
  '555': 'Items pending application',
  '556': 'Called-up equity holdings',
  '557': 'Interim dividend',
  '558': 'Receivable on called-up capital',
  '559': 'Current derivative financial instruments',
  '560': 'Current guarantees received',
  '561': 'Current deposits received',
  '565': 'Current guarantees extended',
  '566': 'Current deposits extended',
  '567': 'Prepaid interest',
  '568': 'Unearned interest received',
  '569': 'Current financial guarantees',
  '570': 'Cash, euros',
  '571': 'Cash, foreign currency',
  '572': 'Banks and financial institutions, demand current accounts, euros',
  '573': 'Banks and financial institutions, demand current accounts, foreign currency',
  '574': 'Banks and financial institutions, savings accounts, euros',
  '575': 'Banks and financial institutions, savings accounts, foreign currency',
  '576': 'Short-term highly-liquid investments',
  '580': 'Fixed assets',
  '581': 'Investments with individuals and related entities',
  '582': 'Investments',
  '583': 'Inventories and trade and other receivables',
  '584': 'Other assets',
  '585': 'Provisions',
  '586': 'Payables of a special nature',
  '587': 'Payables to individuals and related entities',
  '588': 'Trade and other payables',
  '589': 'Other liabilities',
  '593': 'Impairment of current investments in related parties',
  '594': 'Impairment of current debt securities of related parties',
  '595': 'Impairment of current loans to related parties',
  '597': 'Impairment of current debt securities',
  '598': 'Impairment of current loans',
  '599': 'Impairment of non-current assets held for sale',
  '600': 'Merchandise purchased',
  '601': 'Raw materials purchased',
  '602': 'Other supplies purchased',
  '606': 'Prompt payment discounts on purchases',
  '607': 'Subcontracted work',
  '608': 'Purchase returns and similar transactions',
  '609': 'Volume discounts',
  '610': 'Changes in inventories of merchandise',
  '611': 'Changes in inventories of raw materials',
  '612': 'Changes in inventories of other supplies',
  '620': 'Research and development expenses for the period',
  '621': 'Leases and royalties',
  '622': 'Repairs and maintenance',
  '623': 'Independent professional services',
  '624': 'Transport',
  '625': 'Insurance premiums',
  '626': 'Banking and similar services',
  '627': 'Advertising, publicity and public relations',
  '628': 'Utilities',
  '629': 'Other services',
  '630': 'Income tax',
  '631': 'Other taxes',
  '633': 'Negative adjustments to income tax',
  '634': 'Negative adjustments to indirect taxes',
  '636': 'Tax refunds',
  '638': 'Positive adjustments to income tax',
  '639': 'Positive adjustments to indirect taxes',
  '640': 'Salaries and wages',
  '641': 'Termination benefits',
  '642': 'Social Security payable by the company',
  '643': 'Long-term employee benefits payable through defined contribution schemes',
  '644': 'Long-term employee benefits payable through defined benefit schemes',
  '645': 'Equity-based employee benefits',
  '649': 'Employee benefits expense',
  '650': 'Losses on irrecoverable trade receivables',
  '651': 'Results on profit-sharing agreements',
  '659': 'Other operating losses',
  '660': 'Finance expenses arising from provision adjustments',
  '661': 'Interest on bonds and obligations',
  '662': 'Interest on payables',
  '663': 'Losses on fair value measurement of financial instruments',
  '664': 'Expenses arising on dividends payable on liability-classified instruments',
  '665': 'Interest on discounted bills and factoring transactions',
  '666': 'Losses on investments and debt securities',
  '667': 'Losses on non-trade receivables',
  '668': 'Exchange losses',
  '669': 'Other finance expenses',
  '670': 'Losses on intangible assets',
  '671': 'Losses on property, plant and equipment',
  '672': 'Losses on investment property',
  '673': 'Losses on non-current investments in related parties',
  '675': 'Losses on transactions with own bonds',
  '678': 'Exceptional expenses',
  '680': 'Amortisation of intangible assets',
  '681': 'Depreciation of property, plant and equipment',
  '682': 'Depreciation of investment property',
  '690': 'Impairment losses on intangible assets',
  '691': 'Impairment losses on property, plant and equipment',
  '692': 'Impairment losses on investment property',
  '693': 'Impairment losses on inventories',
  '694': 'Impairment losses on trade receivables',
  '695': 'Trade provisions',
  '696': 'Impairment losses on non-current investments and debt securities',
  '697': 'Impairment losses on non-current loans',
  '698': 'Impairment losses on current investments and debt securities',
  '699': 'Impairment losses on current loans',
  '700': 'Merchandise sold',
  '701': 'Finished goods sold',
  '702': 'Semi-finished goods sold',
  '703': 'By-products and waste sold',
  '704': 'Containers and packaging sold',
  '705': 'Services rendered',
  '706': 'Prompt payment discounts',
  '708': 'Sales returns and similar transactions',
  '709': 'Volume discounts',
  '710': 'Changes in inventories of work in progress',
  '711': 'Changes in inventories of semi-finished goods',
  '712': 'Changes in inventories of finished goods',
  '713': 'Changes in inventories of by-products, waste and recovered materials',
  '730': 'Work carried out by the company for intangible assets',
  '731': 'Work carried out by the company for property, plant and equipment',
  '732': 'Work carried out by the company for investment property',
  '733': 'Work carried out by the company for property, plant and equipment in progress',
  '740': 'Operating grants, donations and bequests',
  '746': 'Capital grants, donations and bequests taken to income',
  '747': 'Other grants, donations and bequests taken to income',
  '751': 'Results on profit-sharing agreements',
  '752': 'Income from lease agreements',
  '753': 'Income from transfer of industrial property rights',
  '754': 'Commission income',
  '755': 'Income from services to personnel',
  '759': 'Income from other services',
  '760': 'Dividends',
  '761': 'Income from debt securities',
  '762': 'Income from loans',
  '763': 'Gains on fair value measurement of financial instruments',
  '766': 'Gains on investments and debt securities',
  '767': 'Income from related assets and reimbursement rights from long-term employee benefits',
  '768': 'Exchange gains',
  '769': 'Other finance income',
  '770': 'Gains on intangible assets',
  '771': 'Gains on property, plant and equipment',
  '772': 'Gains on investment property',
  '773': 'Gains on non-current investments in related parties',
  '774': 'Negative goodwill on business combinations',
  '775': 'Gains on transactions with own bonds',
  '778': 'Exceptional income',
  '790': 'Reversal of impairment of intangible assets',
  '791': 'Reversal of impairment of property, plant and equipment',
  '792': 'Reversal of impairment of investment property',
  '793': 'Reversal of impairment of inventories',
  '794': 'Reversal of impairment of trade receivables',
  '795': 'Provision surpluses',
  '796': 'Reversal of impairment of non-current investments and debt securities',
  '797': 'Reversal of impairment of non-current loans',
  '798': 'Reversal of impairment of current investments and debt securities',
};

const ACCOUNT_DEFINITIONS: Record<string, { es: string; en: string }> = {
  // Grupo 1: Financiación Básica
  '100': {
    es: 'Capital aportado por los socios en sociedades mercantiles que revisten forma societaria.',
    en: 'Capital contributed by partners in mercantile companies that have a corporate form.'
  },
  '101': {
    es: 'Aportación inicial o ampliaciones de capital en entidades sin ánimo de lucro.',
    en: 'Initial contribution or capital increases in non-profit entities.'
  },
  '102': {
    es: 'Capital aportado a la empresa por el empresario individual o titular.',
    en: 'Capital contributed to the company by the sole proprietor or owner.'
  },
  '103': {
    es: 'Parte del capital social suscrito que se encuentra pendiente de desembolso por los socios.',
    en: 'Part of the subscribed social capital that is pending payout by the partners.'
  },
  '112': {
    es: 'Reserva obligatoria que debe constituirse detrayendo un 10% del beneficio neto anual.',
    en: 'Statutory reserve that must be built by setting aside 10% of annual net profit.'
  },
  '129': {
    es: 'Representa el beneficio o pérdida obtenido por la empresa al cierre de un ejercicio económico.',
    en: 'Represents the profit or loss obtained by the company at the close of a fiscal year.'
  },
  '170': {
    es: 'Deudas contraídas con bancos u otras entidades de crédito con vencimiento superior a un año.',
    en: 'Debts contracted with banks or other credit institutions with maturity over one year.'
  },
  '173': {
    es: 'Deudas con suministradores de bienes de inmovilizado con vencimiento a largo plazo.',
    en: 'Debts with suppliers of non-current assets with long-term maturity.'
  },
  '175': {
    es: 'Deudas a largo plazo documentadas en efectos de giro aceptados (letras de cambio o pagarés).',
    en: 'Long-term debts documented in accepted bills of exchange or promissory notes.'
  },
  '180': {
    es: 'Efectivo recibido en concepto de garantía a largo plazo para asegurar el cumplimiento de un contrato.',
    en: 'Cash received as a long-term guarantee to secure compliance with a contract.'
  },
  // Grupo 2: Inmovilizado
  '203': {
    es: 'Importe pagado por la propiedad o derecho de uso de patentes, marcas y diseños industriales.',
    en: 'Amount paid for the ownership or right to use patents, trademarks, and industrial designs.'
  },
  '205': {
    es: 'Importe abonado por la subrogación en los derechos y obligaciones de un local de negocio.',
    en: 'Amount paid for subrogation into the rights and duties of a business lease.'
  },
  '206': {
    es: 'Gastos de adquisición o desarrollo de programas informáticos y licencias de software.',
    en: 'Costs of acquiring or developing computer software and software licenses.'
  },
  '210': {
    es: 'Solares de naturaleza urbana, fincas rústicas y otros terrenos propiedad de la empresa.',
    en: 'Urban lots, rustic estates, and other land owned by the company.'
  },
  '211': {
    es: 'Edificaciones, naves industriales, oficinas y otros inmuebles propiedad de la empresa.',
    en: 'Buildings, industrial plants, offices, and other real estate owned by the company.'
  },
  '212': {
    es: 'Conjuntos de elementos ligados de forma definitiva para el proceso productivo (ej. líneas de montaje).',
    en: 'Groups of items permanently linked to the production process (e.g., assembly lines).'
  },
  '213': {
    es: 'Máquinas y aparatos industriales destinados a la elaboración o fabricación de productos.',
    en: 'Industrial machines and apparatus used for compiling or manufacturing products.'
  },
  '214': {
    es: 'Utensilios y herramientas de mano que se utilizan en la producción o mantenimiento.',
    en: 'Hand tools and utensils used in production or maintenance activities.'
  },
  '215': {
    es: 'Redes de agua, gas, calefacción u otras instalaciones complejas no ligadas a una máquina.',
    en: 'Water, gas, heating networks, or other complex facilities not linked to a machine.'
  },
  '216': {
    es: 'Muebles, mesas, estanterías, archivadores y otros elementos de oficina.',
    en: 'Furniture, desks, shelving, filing cabinets, and other office equipment.'
  },
  '217': {
    es: 'Ordenadores, periféricos, servidores y demás equipamiento informático de la empresa.',
    en: 'Computers, peripherals, servers, and other hardware owned by the company.'
  },
  '218': {
    es: 'Vehículos de todo tipo aptos para el transporte terrestre, marítimo o aéreo (coches, camiones).',
    en: 'Vehicles of all types suitable for land, sea, or air transport (cars, trucks).'
  },
  '219': {
    es: 'Cualquier otro elemento de inmovilizado material que no encaje en las cuentas anteriores.',
    en: 'Any other item of tangible non-current assets that does not fit into other accounts.'
  },
  // Amortización / Contra
  '280': {
    es: 'Corrección de valor acumulada por el desgaste o envejecimiento del inmovilizado intangible.',
    en: 'Accumulated valuation adjustment for wear or aging of intangible non-current assets.'
  },
  '281': {
    es: 'Corrección de valor acumulada por el desgaste o envejecimiento del inmovilizado material.',
    en: 'Accumulated valuation adjustment for wear or aging of tangible non-current assets.'
  },
  // Grupo 3: Existencias
  '300': {
    es: 'Bienes adquiridos por la empresa destinados a la venta directa sin transformación química o física.',
    en: 'Goods acquired by the company destined for direct sale without chemical or physical transformation.'
  },
  '310': {
    es: 'Materiales destinados a formar parte de los productos elaborados tras un proceso de fabricación.',
    en: 'Materials destined to be part of manufactured products after a production process.'
  },
  '320': {
    es: 'Envases, embalajes, repuestos o materiales diversos que se consumen en la actividad.',
    en: 'Containers, packaging, spare parts, or miscellaneous materials consumed in operations.'
  },
  // Grupo 4: Acreedores y Deudores por Operaciones Comerciales
  '400': {
    es: 'Deudas con suministradores de mercancías y de materias primas para la actividad habitual.',
    en: 'Debts with suppliers of goods and raw materials for regular business activity.'
  },
  '4009': {
    es: 'Compras de bienes recibidas sobre las que aún no se ha recibido la factura formal.',
    en: 'Purchases of goods received for which the formal invoice has not yet been received.'
  },
  '401': {
    es: 'Deudas comerciales documentadas en efectos de giro aceptados (letras o pagarés a pagar).',
    en: 'Commercial debts documented in accepted bills of exchange or promissory notes to be paid.'
  },
  '403': {
    es: 'Obligaciones comerciales con compañías que pertenecen al mismo grupo corporativo.',
    en: 'Commercial obligations with companies belonging to the same corporate group.'
  },
  '404': {
    es: 'Obligaciones de pago comerciales con empresas asociadas sobre las que se tiene influencia.',
    en: 'Commercial payment obligations with associated companies over which influence is held.'
  },
  '405': {
    es: 'Deudas comerciales con otras partes vinculadas especiales de la empresa.',
    en: 'Commercial debts with other special related parties of the company.'
  },
  '406': {
    es: 'Envases recibidos que se plantean devolver al proveedor tras vaciarse para recuperar una fianza.',
    en: 'Received containers planned to be returned to the supplier to recover a deposit.'
  },
  '407': {
    es: 'Entregas de dinero en efectivo a proveedores a cuenta de futuras compras de existencias.',
    en: 'Cash advances paid to suppliers against future purchases of inventory.'
  },
  '410': {
    es: 'Deudas de servicios que no tienen carácter de mercancía habitual (por ejemplo: gestoría, limpieza, etc.) ...',
    en: 'Debts from services that are not strictly goods-related (e.g., consulting, cleaning).'
  },
  '430': {
    es: 'Derechos de cobro comerciales sobre compradores de mercancías o servicios habituales.',
    en: 'Commercial collection rights over regular buyers of goods or services.'
  },
  '431': {
    es: 'Derechos de cobro comerciales formalizados en letras de cambio aceptadas por clientes.',
    en: 'Commercial collection rights formatted in bills of exchange accepted by customers.'
  },
  '433': {
    es: 'Saldos deudores comerciales con sociedades pertenecientes al mismo grupo de empresas.',
    en: 'Commercial debit balances with companies belonging to the same corporate group.'
  },
  '434': {
    es: 'Derechos de cobro comerciales con entidades asociadas o vinculadas de forma indirecta.',
    en: 'Commercial collection rights with associated or indirectly related entities.'
  },
  '435': {
    es: 'Derechos de cobro por operaciones de tráfico comercial con otras partes vinculadas.',
    en: 'Collection rights for commercial traffic transactions with other related parties.'
  },
  '438': {
    es: 'Anticipos recibidos de compradores de forma previa a realizar la entrega o prestación del servicio.',
    en: 'Advances received from buyers prior to delivering goods or rendering services.'
  },
  '440': {
    es: 'Derechos de cobro con compradores de servicios que no son la actividad principal de la empresa.',
    en: 'Collection rights with buyers of services that are not the primary activity of the company.'
  },
  '472': {
    es: 'Importe del IVA soportado en las compras y gastos realizados por la empresa.',
    en: 'Amount of VAT incurred on purchases and expenses made by the company.'
  },
  '473': {
    es: 'Pagos a cuenta del Impuesto sobre Sociedades o retenciones fiscales practicadas sobre ingresos.',
    en: 'Corporate tax prepayments or tax withholdings deducted from revenues.'
  },
  '477': {
    es: 'Importe del IVA devengado o repercutido en las ventas y prestaciones de servicios de la empresa.',
    en: 'Amount of VAT accrued or charged on sales and rendering of services by the company.'
  },
  // Grupo 5: Cuentas Financieras
  '5200': {
    es: 'Deudas contratadas con bancos orientadas a devolver en un plazo no superior a un año.',
    en: 'Debts contracted with banks expected to be repaid in a term not exceeding one year.'
  },
  '523': {
    es: 'Deudas cortas contraídas por la adquisición de bienes de inmovilizado a corto plazo.',
    en: 'Short-term debts incurred for acquiring short-term non-current assets.'
  },
  '540': {
    es: 'Inversiones temporales en acciones o participaciones de otras empresas sin fin de vinculación.',
    en: 'Temporary investments in shares or stock of other companies with no linking purpose.'
  },
  '541': {
    es: 'Adquisición de bonos, pagarés u obligaciones con la intención de enajenarlos a corto plazo.',
    en: 'Acquisition of bonds, promissory notes, or debentures with the intent of short-term sale.'
  },
  '542': {
    es: 'Préstamos temporales concedidos a terceros con vencimiento inferior o igual a doce meses.',
    en: 'Temporary loans granted to third parties with maturity less than or equal to twelve months.'
  },
  '548': {
    es: 'Depósitos y cuentas a plazo fijo constituidas en entidades de crédito a corto plazo.',
    en: 'Deposits and fixed-term accounts set up in short-term credit institutions.'
  },
  '558': {
    es: 'Derechos de cobro exigibles a los socios por desembolsos acordados pendientes de pago.',
    en: 'Collection rights due from partners for agreed payouts pending payment.'
  },
  '560': {
    es: 'Efectivo recibido como depósito temporal de fianza con vencimiento a corto plazo.',
    en: 'Cash received as a short-term temporary deposit or guarantee.'
  },
  '565': {
    es: 'Efectivo entregado a terceros como depósito temporal para asegurar el cumplimiento de una obligación corta.',
    en: 'Cash paid to third parties as a temporary deposit to secure a short-term obligation.'
  },
  '570': {
    es: 'Monedas y billetes de curso legal mantenidos en la caja de la oficina de la empresa.',
    en: 'Legal tender coins and banknotes kept in the company\'s office cash drawer.'
  },
  '572': {
    es: 'Saldos de efectivo a favor de la empresa depositados en cuentas corrientes bancarias.',
    en: 'Cash balances in favor of the company deposited in bank checking accounts.'
  },
  '573': {
    es: 'Disponibilidades de efectivo en bancos denominadas en moneda distinta al euro.',
    en: 'Cash availability in banks denominated in a currency other than the euro.'
  },
  // Grupo 6: Compras y Gastos
  '600': {
    es: 'Adquisición de mercaderías por parte de la empresa para su posterior comercialización.',
    en: 'Acquisition of merchandise by the company for its subsequent resale.'
  },
  '601': {
    es: 'Adquisición de materias primas que formarán parte de la transformación de productos.',
    en: 'Acquisition of raw materials that will be involved in the transformation of products.'
  },
  '602': {
    es: 'Adquisición de embalajes, repuestos o aprovisionamientos que no se transforman directamente.',
    en: 'Acquisition of packaging, spare parts, or supplies that are not directly processed.'
  },
  '606': {
    es: 'Descuentos de carácter financiero concedidos por proveedores debido a pagos rápidos.',
    en: 'Financial discounts granted by suppliers because of fast payments.'
  },
  '608': {
    es: 'Mercancías rechazadas o devueltas a proveedores tras detectar fallos de calidad o cantidad.',
    en: 'Merchandise rejected or returned to suppliers after finding quality or quantity flaws.'
  },
  '609': {
    es: 'Descuentos comerciales recibidos de proveedores basados en alcanzar un volumen alto de compras.',
    en: 'Commercial discounts received from suppliers based on reaching a high volume of purchases.'
  },
  '610': {
    es: 'Cuenta destinada a reflejar la diferencia entre las existencias de mercaderías al inicio y al final del año.',
    en: 'Account used to reflect the difference between merchandise stocks at the start and end of the year.'
  },
  '620': {
    es: 'Gastos soportados en actividades de investigación y desarrollo científico.',
    en: 'Expenses incurred in scientific or operating research and development activities.'
  },
  '621': {
    es: 'Gastos devengados por el uso y alquiler de locales, oficinas, solares, patentes o maquinaria de terceros.',
    en: 'Expenses incurred for the use and lease of buildings, offices, land, patents, or machinery.'
  },
  '622': {
    es: 'Gastos de mantenimiento, conservación y arreglo de bienes de inmovilizado de la empresa.',
    en: 'Expenses for maintaining, preserving, and repairing non-current assets.'
  },
  '623': {
    es: 'Honorarios pagados a profesionales como notarios, abogados, auditores o asesores fiscales de la firma.',
    en: 'Fees paid to professionals such as notaries, lawyers, auditors, or company tax advisors.'
  },
  '624': {
    es: 'Gastos por el desplazamiento de mercancías y envíos realizados a cargo de la sociedad.',
    en: 'Expenses for transporting merchandise and shipments borne by the company.'
  },
  '625': {
    es: 'Costes vinculados a pólizas de seguro contratadas (antirrobo, responsabilidad civil, etc.).',
    en: 'Costs linked to contracted insurance policies (anti-theft, civil liability, etc.).'
  },
  '626': {
    es: 'Comisiones cobradas por bancos debido a custodia, transferencias u operaciones de cobro/pago.',
    en: 'Commissions charged by banks for custody, transfers, or collection/payment transactions.'
  },
  '628': {
    es: 'Gastos de consumo de servicios no acumulables físicamente (ej. electricidad, agua, gas).',
    en: 'Consumption expenses of physically non-storable services (e.g., electricity, water, gas).'
  },
  '629': {
    es: 'Suma de gastos diversos que no encajan en ninguna de las otras cuentas de servicios exteriores.',
    en: 'Sum of miscellaneous expenses that do not fit into other external service accounts.'
  },
  '650': {
    es: 'Pérdidas definitivas por créditos de clientes declarados insolventes o fallidos.',
    en: 'Definite losses from customer credit balances declared bankrupt or bad debts.'
  },
  '662': {
    es: 'Intereses y gastos financieros devengados por deudas recibidas de entidades financieras.',
    en: 'Interests and financial expenses accrued on debts from financial institutions.'
  },
  '666': {
    es: 'Pérdidas producidas por la baja de valores de deuda o acciones en inversiones financieras.',
    en: 'Losses produced by removing debt values or shares in financial investments.'
  },
  '678': {
    es: 'Gastos extraordinarios de carácter inusual o infrecuente (ej. inundación, multas graves).',
    en: 'Extraordinary expenses of unusual or infrequent nature (e.g., flooding, heavy fines).'
  },
  // Grupo 7: Ventas e Ingresos
  '700': {
    es: 'Ingresos procedentes de la venta directa de mercancías adquiridas para revenderlas.',
    en: 'Revenues from transferring merchandise acquired for direct resale.'
  },
  '701': {
    es: 'Ingresos por la comercialización de productos fabricados o elaborados internamente.',
    en: 'Revenues from marketing products manufactured or processed internally.'
  },
  '704': {
    es: 'Facturación por envases o embalajes enajenados de forma definitiva u opcional.',
    en: 'Invoicing for packaging or containers sold definitively or optionally.'
  },
  '705': {
    es: 'Ingresos por servicios profesionales, técnicos u operativos prestados por la empresa.',
    en: 'Revenues from professional, technical, or operational services rendered by the company.'
  },
  '706': {
    es: 'Descuentos financieros concedidos a clientes por pagar de forma inmediata o rápida.',
    en: 'Financial discounts granted to customers for paying immediately or before maturity.'
  },
  '708': {
    es: 'Importe de devoluciones de productos por parte de clientes insatisfechos o defectuosos.',
    en: 'Amount of product returns by unsatisfied or defective product customers.'
  },
  '709': {
    es: 'Descuentos de carácter comercial concedidos a clientes habituales por volumen elevado.',
    en: 'Commercial discounts granted to regular customers due to high volume.'
  },
  '752': {
    es: 'Ingresos obtenidos por subarrendar locales, oficinas o bienes de equipo de la sociedad.',
    en: 'Revenues obtained by subleasing buildings, offices, or company equipment.'
  },
  '754': {
    es: 'Ingresos por actuar como mediadores comerciales devengados en base a comisiones pactadas.',
    en: 'Revenues for acting as commercial mediators accrued based on agreed commissions.'
  },
  '755': {
    es: 'Ingresos procedentes de servicios como comedores o transporte prestados al personal laboral.',
    en: 'Revenues from dining halls, transport, or housing provided to staff.'
  },
  '760': {
    es: 'Dividendos procedentes de participaciones o acciones poseídas en el capital de otras corporaciones.',
    en: 'Dividends from shares or stock held in the capital of other firms.'
  },
  '766': {
    es: 'Beneficios obtenidos en la enajenación o amortización de acciones y obligaciones de deuda.',
    en: 'Profits obtained in selling or redeeming shares and bonds.'
  },
  '769': {
    es: 'Cualquier otro tipo de ingreso de índole puramente financiera que no encaje en los demás.',
    en: 'Any other type of purely financial revenue that does not explicitly fit elsewhere.'
  }
};

const SECTION_DISPLAY: Record<string, string> = {
  'Activo no corriente': 'Non-current assets',
  'Activo corriente': 'Current assets',
  'Patrimonio neto': 'Equity',
  'Pasivo no corriente': 'Non-current liabilities',
  'Pasivo corriente': 'Current liabilities'
};

const BALANCE_DISPLAY: Record<string, string> = {
  'Saldo deudor': 'Debit balance',
  'Saldo acreedor': 'Credit balance',
  'Saldo nulo': 'Zero/Null balance'
};

const TYPE_DISPLAY: Record<string, string> = {
  'Código de cuenta': 'Account code',
  'Asiento contable': 'Accounting entry',
  'Sección del balance': 'Balance sheet section',
  'Saldos posibles': 'Possible balances'
};

const SCENARIO_TRANSLATIONS: Record<string, string> = {
  'En la constitución de la sociedad (Ej: creación de una S.A. con talón bancario) de Capital social': 'Upon incorporation of the company (e.g., creation of a S.A. with a bank check) of Share capital',
  'Por las reducciones de capital o extinción de la sociedad de Capital social': 'For capital reductions or liquidation of the company of Share capital',
  'Por la aportación inicial al crear una entidad sin ánimo de lucro (Ej: tres amigos crean una asociación depositando fondos) de Fondo social': 'For initial contribution when creating a non-profit entity (e.g., three friends create an association by depositing funds) of Assigned capital',
  'A la extinción de la entidad de Fondo social': 'Upon dissolution of the entity of Assigned capital',
  'Por el capital inicial (Ej: empresario individual aporta efectivo a su firma) de Capital': 'For initial capital (e.g., sole proprietor contributes cash to the firm) of Capital',
  'Por el cese o cesión de los negocios de Capital': 'Upon cessation or transfer of business of Capital',
  'Al constituirse la sociedad por el nominal no desembolsado (Ej: constitución de S.A. desembolsando solo el mínimo legal) de Socios por desembolsos no exigidos': 'Upon incorporation of the company for uncalled par value (e.g., incorporation of a S.A. depositing only the legal minimum) of Uncalled capital',
  'Cuando la sociedad exige formalmente el desembolso de Socios por desembolsos no exigidos': 'When the company formally demands payment of Uncalled capital',
  'Al cierre del ejercicio con cargo a la cuenta de resultados (Ej: destino de parte del beneficio tras la regularización) de Reserva legal': 'At year-end charged to the result account (e.g., allocation of part of profit after adjustment) of Legal reserve',
  'Por la disposición que se haga de ella de Reserva legal': 'For any use made of it of Legal reserve',
  'Para determinar el resultado si los ingresos superan a los gastos (Ej: regularización de ingresos del grupo 7) de Resultado del ejercicio': 'To determine profit if income exceeds expenses (e.g., closing entry for group 7 revenues) of Profit/Loss for the year',
  'Si los gastos superan a los ingresos o al aplicar el beneficio de Resultado del ejercicio': 'If expenses exceed revenues or upon profit distribution of Profit/Loss for the year',
  'Al formalizar el préstamo (Ej: préstamo bancario a devolver en 5 años) de Deudas a largo plazo con entidades de crédito': 'Upon formalization of the loan (e.g., bank loan to be repaid in 5 years) of Non-current payables to credit institutions',
  'Por el reintegro anticipado o la reclasificación a corto plazo de Deudas a largo plazo con entidades de crédito': 'For early repayment or reclassification to short term of Non-current payables to credit institutions',
  'Por la recepción conforme de los bienes (Ej: compra de máquina pagando una parte a 18 meses) de Proveedores de inmovilizado a largo plazo': 'Upon satisfactory reception of goods (e.g., purchase of machinery paying part at 18 months) of Non-current suppliers of non-current assets',
  'Al cancelar o pagar la deuda anticipadamente de Proveedores de inmovilizado a largo plazo': 'Upon cancelling or paying the debt early of Non-current suppliers of non-current assets',
  'Al aceptar los efectos (Ej: letras aceptadas a 24 meses por compra de inmuebles) de Efectos a pagar a largo plazo': 'Upon accepting bills/promissory notes (e.g., bills accepted at 24 months for purchase of real estate) of Non-current bills payable',
  'Por el pago anticipado o reclasificación de Efectos a pagar a largo plazo': 'For early payment or reclassification of Non-current bills payable',
  'Al recibir la garantía (Ej: cobro de fianza por alquiler de edificio a 6 años) de Fianzas recibidas a largo plazo': 'Upon receiving the guarantee (e.g., collection of deposit for a 6-year building lease) of Non-current guarantees received',
  'Al devolver la fianza o por su reclasificación a corto plazo de Fianzas recibidas a largo plazo': 'Upon returning the deposit or its reclassification to short term of Non-current guarantees received',
  'Por la adquisición (Ej: compra de patente para fabricar carne vegetal) de Propiedad industrial': 'Upon acquisition (e.g., purchase of patent to manufacture plant-based meat) of Industrial property',
  'Por enajenación o baja del activo de Propiedad industrial': 'Upon disposal or write-off of the asset of Industrial property',
  'Al pagar al arrendatario anterior (Ej: pago por subrogación en contrato de oficinas) de Derechos de traspaso': 'Upon paying previous lessee (e.g., payment by subrogation in office lease contract) of Leasehold rights',
  'Por baja o venta del derecho de Derechos de traspaso': 'Upon write-off or sale of the right of Leasehold rights',
  'Por la compra a terceros (Ej: adquisición de software de gestión) de Aplicaciones informáticas': 'Upon purchase from third parties (e.g., acquisition of management software) of Computer software',
  'Por su baja o venta de Aplicaciones informáticas': 'Upon write-off or sale of Computer software',
  'Al adquirir el suelo (Ej: compra de un hotel separando el valor del solar) de Terrenos y bienes naturales': 'Upon acquiring land (e.g., purchase of a hotel separating the value of the plot) of Land and natural resources',
  'Al vender el terreno (Ej: venta del local social) de Terrenos y bienes naturales': 'Upon selling the land (e.g., sale of social headquarters) of Land and natural resources',
  'Por la compra del edificio (Ej: adquisición de naves u oficinas) de Construcciones': 'Upon purchasing the building (e.g., acquisition of warehouses or offices) of Buildings',
  'Por su venta (Ej: enajenación de locales sin beneficio ni pérdida) de Construcciones': 'Upon selling it (e.g., disposal of premises with no profit or loss) of Buildings',
  'Por la compra (Ej: hospital adquiere equipo quirúrgico especial) de Instalaciones técnicas': 'Upon purchase (e.g., hospital acquires special surgical equipment) of Technical facilities',
  'Por devolución al proveedor o enajenación de Instalaciones técnicas': 'Upon return to supplier or disposal of Technical facilities',
  'Por la adquisición (Ej: compra de máquina de uso industrial) de Maquinaria': 'Upon acquisition (e.g., purchase of machine for industrial use) of Machinery',
  'Por venta (Ej: venta de equipo industrial obsoleto) de Maquinaria': 'Upon sale (e.g., sale of obsolete industrial equipment) of Machinery',
  'Al comprar las herramientas (Ej: compra de herramientas para el almacén pagadas con tarjeta) de Utillaje': 'Upon purchasing tools (e.g., purchase of tools for warehouse paid by card) of Tooling',
  'Por regularización anual o rotura de Utillaje': 'Upon annual adjustment or breakage of Tooling',
  'Por la compra (Ej: adquisición de pistas de fútbol/baloncesto para empleados) de Otras instalaciones': 'Upon purchase (e.g., acquisition of soccer/basketball courts for employees) of Other facilities',
  'Por baja o venta de Otras instalaciones': 'Upon write-off or sale of Other facilities',
  'Por la adquisición (Ej: compra a crédito de muebles de oficina) de Mobiliario': 'Upon acquisition (e.g., purchase of office furniture on credit) of Furniture',
  'Por su baja del activo de Mobiliario': 'Upon write-off from assets of Furniture',
  'Por la compra (Ej: empresa de fruta adquiere ordenadores para el almacén) de Equipos para procesos de información': 'Upon purchase (e.g., fruit company acquires computers for warehouse) of Computer hardware',
  'Por venta o fin de vida útil de Equipos para procesos de información': 'Upon sale or end of useful life of Computer hardware',
  'Por la adquisición (Ej: compra al contado de una furgoneta de reparto) de Elementos de transporte': 'Upon acquisition (e.g., cash purchase of a delivery van) of Transport equipment',
  'Por baja definitiva (Ej: furgoneta carbonizada en incendio declarada siniestro total) de Elementos de transporte': 'Upon definitive write-off (e.g., van carbonized in fire declared a total loss) of Transport equipment',
  'Por la compra (Ej: adquisición de papeleras y contenedores para administración) de Otro inmovilizado material': 'Upon purchase (e.g., acquisition of waste bins and administration containers) of Other tangible assets',
  'Por baja del activo de Otro inmovilizado material': 'Upon write-off from assets of Other tangible assets',
  'A la compra (Ej: empresa adquiere acciones de una firma de su mismo grupo) de Participaciones a largo plazo en partes vinculadas': 'Upon purchasing (e.g., company acquires shares of a group firm) of Non-current investments in related parties',
  'Por enajenación o deterioro de Participaciones a largo plazo en partes vinculadas': 'Upon disposal or impairment of Non-current investments in related parties',
  'A la suscripción (Ej: compra de títulos de renta fija con vencimiento a 5 años) de Valores representativos de deuda a largo plazo con partes vinculadas': 'Upon subscribing (e.g., purchase of fixed-income bonds with a 5-year maturity) of Non-current debt securities in related parties',
  'Por venta o amortización de Valores representativos de deuda a largo plazo con partes vinculadas': 'Upon sale or amortization of Non-current debt securities in related parties',
  'A la compra (Ej: empresa adquiere acciones de una firma) de Participaciones a largo plazo': 'Upon purchasing (e.g., company acquires shares of a firm) of Non-current investments',
  'Por enajenación o deterioro de Participaciones a largo plazo': 'Upon disposal or impairment of Non-current investments',
  'A la suscripción (Ej: compra de títulos de renta fija con vencimiento a 5 años) de Valores representativos de deuda a largo plazo': 'Upon subscribing (e.g., purchase of fixed-income bonds with a 5-year maturity) of Non-current debt securities',
  'Por venta o amortización de Valores representativos de deuda a largo plazo': 'Upon sale or amortization of Non-current debt securities',
  'A la formalización (Ej: préstamo concedido a un amigo a devolver en 30 meses) de Créditos a largo plazo': 'Upon formalization (e.g., loan granted to a friend to be repaid in 30 months) of Non-current loans',
  'Por el cobro o reclasificación de Créditos a largo plazo': 'Upon collection or reclassification of Non-current loans',
  'Al recuperar los fondos de Imposiciones a largo plazo': 'Upon recovering the funds of Non-current time deposits',
  'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento físico de fruta en almacén el 31/12)': 'At year-end for final inventory value (e.g., physical recount of fruit in warehouse on 12/31)',
  'Al cierre del ejercicio por el valor de las existencias iniciales de Mercaderías': 'At year-end for initial inventory value of Goods for resale',
  'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento de harina en una panadería)': 'At year-end for final inventory value (e.g., recount of flour in a bakery)',
  'Al cierre del ejercicio por el valor de las existencias iniciales de Materias primas': 'At year-end for initial inventory value of Raw materials',
  'Al cierre del ejercicio por el valor de las existencias finales (Ej: recuento de envases o repuestos)': 'At year-end for final inventory value (e.g., recount of packing elements or spare parts)',
  'Al cierre del ejercicio por el valor de las existencias iniciales de Otros aprovisionamientos': 'At year-end for initial inventory value of Other supplies',
  'Al recibir el pedido (Ej: compra de naranjas a un agricultor)': 'Upon receiving order (e.g., purchase of oranges from a farmer)',
  'Al cierre del ejercicio para saldar la cuenta de Compra de mercaderías contra Resultado del ejercicio': 'At year-end to close the Purchase of goods for resale account against Profit/Loss for the year',
  'compra de madera para fabricar muebles': 'purchase of wood to manufacture furniture',
  'Al cierre del ejercicio para saldar la cuenta de Compra de materias primas': 'At year-end to close the Purchase of raw materials account',
  'compra de cajas de cartón para embalaje': 'purchase of cardboard boxes for packaging',
  'Al cierre del ejercicio para saldar la cuenta de Compras de otros aprovisionamientos': 'At year-end to close the Purchase of other supplies account',
  'Al pagar antes del plazo pactado (Ej: descuento del 2 % por pagar al contado)': 'When paying before agreed due date (e.g., 2% discount for cash payment)',
  'Al cierre del ejercicio para saldar la cuenta de Descuentos sobre compras por pronto pago': 'At year-end to close the Cash discounts on purchases account',
  'Al devolver mercancía defectuosa (Ej: devolución de fruta en mal estado)': 'Upon returning defective goods (e.g., return of spoiled fruit)',
  'Al cierre del ejercicio para saldar la cuenta de Devoluciones de compras': 'At year-end to close the Purchase returns account',
  'Descuento que te aplica el vendedor por alcanzar un volumen de pedido alto': 'Discount applied by seller for reaching a high volume of orders',
  'Al cierre del ejercicio para saldar la cuenta de Rappels por compras': 'At year-end to close the Volume discounts on purchases account',
  'Al cierre del ejercicio por las existencias iniciales de Variación de existencias de mercaderías': 'At year-end for initial inventory of Change in inventories of goods for resale',
  'Al cierre del ejercicio por las existencias finales de Variación de existencias de mercaderías': 'At year-end for final inventory of Change in inventories of goods for resale',
  'Por los gastos realizados (Ej: pago a laboratorio por estudio de nuevos sabores)': 'For expenses incurred (e.g., payment to lab for studying new flavors)',
  'Al cierre del ejercicio para saldar la cuenta de Gastos en I+D': 'At year-end to close the Research and development expenses account',
  'Al recibir la factura del alquiler (Ej: pago mensual del local de la tienda)': 'Upon receiving rental invoice (e.g., monthly lease payment for the store premises)',
  'Al cierre del ejercicio para saldar la cuenta de Arrendamientos': 'At year-end to close the Leases and royalties account',
  'Por el mantenimiento (Ej: factura del técnico que arregla el aire acondicionado)': 'For maintenance (e.g., invoice from technician repairing the air conditioning)',
  'Al cierre del ejercicio para saldar la cuenta de Reparaciones': 'At year-end to close the Repairs and maintenance account',
  'Por los honorarios (Ej: factura del abogado o del gestor contable)': 'For professional fees (e.g., invoice from lawyer or accountant)',
  'Al cierre del ejercicio para saldar la cuenta de Servicios profesionales': 'At year-end to close the Independent professional services account',
  'Por los portes (Ej: pago a la agencia de transportes por enviar pedidos)': 'For transport costs (e.g., payment to transport agency for shipping orders)',
  'Al cierre del ejercicio para saldar la cuenta de Transportes': 'At year-end to close the Transport account',
  'Al pagar la póliza (Ej: seguro anual contra incendios del almacén)': 'Upon paying the policy premium (e.g., annual warehouse fire insurance)',
  'Al cierre del ejercicio para saldar la cuenta de Seguros': 'At year-end to close the Insurance premiums account',
  'Por las comisiones (Ej: cargo del banco por mantenimiento de cuenta)': 'For fees and commissions (e.g., bank charge for account maintenance)',
  'Al cierre del ejercicio para saldar la cuenta de Servicios bancarios': 'At year-end to close the Bank service fees account',
  'Por el consumo (Ej: factura de la luz, agua o gas)': 'For consumption (e.g., electricity, water or gas invoice)',
  'Al cierre del ejercicio para saldar la cuenta de Suministros': 'At year-end to close the Utilities account',
  'Por gastos diversos (Ej: compra de material de oficina o gastos de viaje)': 'For miscellaneous expenses (e.g., purchase of office supplies or travel expenses)',
  'Al cierre del ejercicio para saldar la cuenta de Otros servicios': 'At year-end to close the Other services account',
  'Al declarar un cliente como fallido (Ej: cliente en concurso de acreedores que no pagará)': 'Upon declaring a client as bankrupt (e.g., client in bankruptcy proceedings who will not pay)',
  'Al cierre del ejercicio para saldar la cuenta de Pérdidas por incobrables': 'At year-end to close the Losses on bad debts account',
  'Al devengarse los intereses (Ej: cargo bancario por intereses del préstamo)': 'Upon accrual of interest (e.g., bank charge for loan interest)',
  'Al cierre del ejercicio para saldar la cuenta de Intereses de deudas': 'At year-end to close the Interest on payables account',
  'Al vender con pérdida (Ej: venta de acciones por debajo de su precio de compra)': 'Upon selling with losses (e.g., sale of shares below purchase price)',
  'Al cierre del ejercicio para saldar la cuenta de Pérdidas financieras': 'At year-end to close the Losses on non-current financial assets account',
  'Por sucesos imprevistos (Ej: pago de una multa de tráfico de la furgoneta)': 'On unexpected events (e.g., payment of cargo van traffic fine)',
  'Al cierre del ejercicio para saldar la cuenta de Gastos excepcionales': 'At year-end to close the Exceptional expenses account',
  'Al realizar la venta (Ej: venta de 500 kg de manzanas a un supermercado)': 'Upon performing sale (e.g., sale of 500 kg of apples to a supermarket)',
  'Al cierre del ejercicio para saldar la cuenta de Venta de mercaderías contra Resultado del ejercicio': 'At year-end to close the Sales of goods for resale account against Profit/Loss for the year',
  'Al realizar la venta (Ej: panadería vende sus barras de pan a tiendas)': 'Upon performing sale (e.g., bakery sells its bread loaves to shops)',
  'Al cierre del ejercicio para saldar la cuenta de Venta de productos terminados': 'At year-end to close the Sales of finished goods account',
  'Al vender los envases (Ej: venta de palets usados a otra empresa)': 'Upon selling packagings (e.g., sale of used pallets to another company)',
  'Al cierre del ejercicio para saldar la cuenta de Venta de envases': 'At year-end to close the Sales of packagings account',
  'Al facturar el servicio (Ej: cobro por asesorar a otra empresa en logística)': 'Upon billing the service (e.g., collection for logistics consulting)',
  'Al cierre del ejercicio para saldar la cuenta de Prestación de servicios': 'At year-end to close the Performance of services account',
  'Al conceder el descuento (Ej: rebaja al cliente por pagarnos al contado)': 'Upon granting discount (e.g., discount to client for cash payment)',
  'Al cierre del ejercicio para saldar la cuenta de Descuentos sobre ventas por pronto pago': 'At year-end to close the Cash discounts on sales account',
  'Al recibir mercancía devuelta (Ej: cliente nos devuelve fruta por no ser el calibre pactado)': 'Upon receiving returned goods (e.g., client returns fruit due to wrong size)',
  'Al cierre del ejercicio para saldar la cuenta de Devoluciones de ventas': 'At year-end to close the Sales returns account',
  'Al conceder el abono por volumen (Ej: descuento al cliente por comprarnos más de 50 toneladas)': 'Upon granting volume discount (e.g., rebate to client for buying over 50 tons)',
  'Al cierre del ejercicio para saldar la cuenta de Rappels sobre ventas': 'At year-end to close the Volume discounts on sales account',
  'Al facturar el alquiler (Ej: cobro mensual por alquilar una oficina que nos sobra)': 'Upon billing lease (e.g., monthly collection for rental of spare office)',
  'Al cierre del ejercicio para saldar la cuenta de Ingresos por arrendamientos': 'At year-end to close the Revenues from leases account',
  'Al devengar la comisión (Ej: cobro por mediar en una venta entre terceros)': 'Upon commission accrual (e.g., collection for mediating sale between third parties)',
  'Al cierre del ejercicio para saldar la cuenta de Ingresos por comisiones': 'At year-end to close the Revenues from commissions account',
  'Por servicios prestados (Ej: cobro a empleados por el uso del comedor de empresa)': 'For services rendered (e.g., charge to employees for company cafeteria usage)',
  'Al cierre del ejercicio para saldar la cuenta de Ingresos por servicios al personal': 'At year-end to close the Revenues from services to personnel account',
  'Al cobrar dividendos (Ej: cobro de beneficios de las acciones que poseemos)': 'Upon collecting dividends (e.g., collection of profits from owned shares)',
  'Al cierre del ejercicio para saldar la cuenta de Ingresos de participaciones': 'At year-end to close the Revenues from equity investments account',
  'Al vender con beneficio (Ej: venta de acciones por encima de su precio de compra)': 'Upon selling with profit (e.g., sale of shares above purchase price)',
  'Al cierre del ejercicio para saldar la cuenta de Beneficios financieros': 'At year-end to close the Financial revenues account',
  'Por intereses a nuestro favor (Ej: intereses abonados por el banco en nuestra cuenta)': 'For interest in our favor (e.g., interest paid by bank to our account)',
  'Al cierre del ejercicio para saldar la cuenta de Otros ingresos financieros': 'At year-end to close the Other finance income account',
  'Al recibir la factura de compra (Ej: compra de fruta a pagar en 30 días)': 'Upon receiving the purchase invoice (e.g., purchase of fruit to be paid in 30 days)',
  'Al pagar la deuda (Ej: transferencia bancaria al proveedor) de Proveedores': 'Upon paying debt (e.g., bank transfer to supplier) of Suppliers',
  'Al recibir la mercancía sin factura (Ej: llega el camión de fruta pero no el documento de cargo)': 'Upon receiving goods without invoice (e.g., fruit truck arrives without the invoice document)',
  'Al recibir la factura definitiva de Proveedores, facturas pendientes de recibir o formalizar': 'Upon receiving the definitive invoice of Suppliers, invoices pending receipt or formalization',
  'Al aceptar la letra o pagaré (Ej: aceptamos pagaré a 60 días por compra de mercancía)': 'Upon accepting bill/promissory note (e.g., we accept 60-day promissory note for merchandise purchase)',
  'Al pagar el efecto al vencimiento de Proveedores, efectos comerciales a pagar': 'Upon paying bill at maturity of Suppliers, bills payable',
  'Al recibir envases con facultad de devolución (Ej: recibimos cajas de plástico retornables con la fruta)': 'Upon receiving packagings with return option (e.g., we receive returnable plastic crates with the fruit)',
  'Al devolver los envases o decidir quedárselos de Envases y embalajes a devolver a proveedores': 'Upon returning the packagings or deciding to keep them of Packing elements to be returned to suppliers',
  'Al entregar dinero a cuenta (Ej: pago de 1.000 € antes de recibir el pedido de fruta)': 'Upon delivering money on account (e.g., payment of €1,000 before receiving the fruit order)',
  'Al recibir la mercancía y aplicar el anticipo de Anticipos a proveedores': 'Upon receiving the goods and applying the advance of Advances to suppliers',
  'Al recibir la factura de un servicio (Ej: deuda con la empresa de limpieza o seguridad)': 'Upon receiving service invoice (e.g., debt with cleaning or security firm)',
  'Al pagar la factura de Acreedores por prestaciones de servicios': 'Upon paying the invoice of Sundry creditors for services',
  'Al emitir la factura de venta (Ej: venta de fruta a cobrar en 15 días)': 'Upon issuing sale invoice (e.g., sale of fruit to be collected in 15 days)',
  'Al cobrar la factura (Ej: ingreso en cuenta del pago del cliente) de Clientes': 'Upon collecting the invoice (e.g., receipt on account of client payment) of Customers',
  'Al recibir el efecto aceptado (Ej: el cliente nos entrega un pagaré por su compra)': 'Upon receiving accepted bill (e.g., client hands us a promissory note for their purchase)',
  'Al cobrar el efecto al vencimiento de Clientes, efectos comerciales a cobrar': 'Upon collecting the commercial paper at maturity of Customers, bills receivable',
  'Al vender a una empresa del mismo grupo (Ej: venta de fruta a una filial de la sociedad) de Clientes, empresas asociadas': 'Upon selling to a group company (e.g., sale of fruit to a subsidiary of the company) of Customers, related parties',
  'Al cobrar la deuda de Clientes, empresas asociadas': 'Upon collecting the debt of Customers, related parties',
  'Al recibir dinero a cuenta (Ej: el cliente nos paga 500 € antes de que le enviemos la fruta) de Anticipos de clientes': 'Upon receiving money on account (e.g., client pays us €500 before we send the fruit) of Advances from customers',
  'Al realizar la venta y aplicar el anticipo de Anticipos de clientes': 'Upon performing the sale and applying the advance of Advances from customers',
  'Por ingresos que no son ventas (Ej: deuda de un tercero por habernos comprado mobiliario usado)': 'For income from non-sales sources (e.g., third party debt for having bought used furniture from us)',
  'Al cobrar la deuda de Deudores': 'Upon collecting the debt of Sundry debtors',
  'Al comprar bienes o servicios (Ej: IVA del 21 % en la factura de compra de maquinaria)': 'Upon buying goods or services (e.g., 21% VAT in the machinery purchase invoice)',
  'Al realizar la liquidación trimestral del IVA de Hacienda Pública, IVA soportado': 'Upon performing quarterly VAT filing of Public Treasury, Input VAT',
  'Al recibir un ingreso con retención (Ej: el banco nos retiene IRPF sobre los intereses)': 'Upon receiving income with withholding tax (e.g., bank withholds PIT on interest)',
  'Al liquidar el Impuesto sobre Sociedades de Hacienda Pública, retenciones y pagos a cuenta': 'Upon settling Corporate Income Tax of Public Treasury, withholdings and payments on account',
  'Al realizar una venta (Ej: IVA del 4 % en la factura de venta de fruta)': 'Upon performing a sale (e.g., 4% VAT in the fruit sale invoice)',
  'Al realizar la liquidación trimestral del IVA de Hacienda Pública, IVA repercutido': 'Upon performing quarterly VAT filing of Public Treasury, Output VAT',
  'Al recibir el préstamo (Ej: crédito bancario a devolver en 6 meses)': 'Upon receiving the loan (e.g., bank credit to be repaid in 6 months)',
  'Al pagar las cuotas o el total de la deuda de Préstamos a corto plazo con entidades de crédito': 'Upon paying installments or total debt of Short-term loans from credit institutions',
  'Al comprar el activo (Ej: compra de un ordenador a pagar en 90 días)': 'Upon buying the asset (e.g., purchase of a computer to be paid in 90 days)',
  'Al pagar la deuda de Proveedores de inmovilizado a corto plazo': 'Upon paying the debt of Short-term suppliers of non-current assets',
  'Al comprar acciones para especular (Ej: compra de acciones de bolsa para vender en 3 meses)': 'Upon buying shares to speculate (e.g., purchase of stock shares to sell in 3 months)',
  'Al vender las acciones de Inversiones financieras a corto plazo en instrumentos de patrimonio': 'Upon selling the shares of Short-term investments in equity instruments',
  'Al suscribir los títulos (Ej: compra de letras del tesoro a 6 meses)': 'Upon subscribing securities (e.g., purchase of treasury bills at 6 months)',
  'Al recuperar la inversión de Valores representativos de deuda a corto plazo': 'Upon recovering investment of Short-term debt securities',
  'Al conceder el préstamo (Ej: dinero prestado a otra empresa a devolver en 8 meses)': 'Upon granting loan (e.g., money lent to another company to be repaid in 8 months)',
  'Al cobrar el préstamo de Créditos a corto plazo': 'Upon collecting loan of Short-term loans',
  'Al abrir el depósito (Ej: imposición a plazo fijo de 4 meses)': 'Upon opening deposit (e.g., time deposit at 4 months)',
  'Al recuperar los fondos de Imposiciones a corto plazo': 'Upon recovering funds of Short-term time deposits',
  'Cuando la sociedad pide el dinero (Ej: se exige el pago del 25 % restante de las acciones)': 'When the company calls of payments (e.g., requiring the remaining 25% payment of shares)',
  'Cuando los socios realizan el ingreso de Socios por desembolsos exigidos': 'When shareholders make the contribution of Capital called-up',
  'Al recibir la garantía (Ej: cobro de fianza por alquiler de equipo para un evento de 1 mes)': 'Upon receiving guarantee (e.g., deposit collection for 1-month equipment rental)',
  'Al devolver la fianza de Fianzas recibidas a corto plazo': 'Upon returning the guarantee of Short-term guarantees received',
  'Al entregar la garantía (Ej: pago de fianza por alquilar una furgoneta una semana)': 'Upon delivering guarantee (e.g., payment of deposit to rent a van for a week)',
  'Al recuperar la fianza de Fianzas constituidas a corto plazo': 'Upon recovering deposit of Short-term guarantees extended',
  'Por las entradas de efectivo (Ej: cobro en metálico de una venta menor)': 'For cash entries (e.g., cash collection of a minor sale)',
  'Por los pagos en metálico (Ej: pago de correos o pequeños suministros) de Caja': 'For cash payments (e.g., post office or small supplies payments) of Cash',
  'Por los ingresos en cuenta (Ej: transferencia recibida de un cliente)': 'For account deposits (e.g., transfer received from a customer)',
  'Por los pagos por banco (Ej: pago de nóminas o recibos domiciliados) de Bancos': 'For bank payments (e.g., payroll or direct-debited bills) of Banks',
  'Por ingresos en divisas (Ej: cobro en dólares de una venta a EE.UU.)': 'For currency deposits (e.g., collection in dollars of a sale to the USA)',
  'Por pagos en divisas de Bancos, moneda extranjera': 'For payments in foreign currency of Banks, foreign currency'
};

const translateScenarioText = (text: string, lang: string): string => {
  if (lang !== 'en') return text;
  
  if (SCENARIO_TRANSLATIONS[text]) {
    return SCENARIO_TRANSLATIONS[text];
  }
  
  let translated = text;
  if (translated.startsWith('CASO: ')) {
    const rawBody = translated.substring(6);
    return `CASE: ${SCENARIO_TRANSLATIONS[rawBody] || translatePhrases(rawBody, lang)}`;
  }
  if (translated.startsWith('EJEMPLO: ')) {
    const rawBody = translated.substring(9);
    return `EXAMPLE: ${SCENARIO_TRANSLATIONS[rawBody] || translatePhrases(rawBody, lang)}`;
  }
  if (translated.startsWith('CUENTA: ')) {
    const accountName = translated.substring(8);
    const foundCode = Object.keys(ACCOUNT_MAPPING).find(code => ACCOUNT_MAPPING[code] === accountName);
    const engName = foundCode ? (ACCOUNT_MAPPING_EN[foundCode] || accountName) : accountName;
    return `ACCOUNT: ${engName}`;
  }

  const foundCode = Object.keys(ACCOUNT_MAPPING).find(code => ACCOUNT_MAPPING[code] === text);
  if (foundCode) {
    return ACCOUNT_MAPPING_EN[foundCode] || text;
  }
  
  return translatePhrases(translated, lang);
};

const translatePhrases = (str: string, lang: string): string => {
  if (lang !== 'en') return str;
  let res = str;
  const replaces = [
    { from: 'Al pagar', to: 'When paying' },
    { from: 'Al recibir', to: 'When receiving' },
    { from: 'Por la compra', to: 'On purchase' },
    { from: 'Por la adquisición', to: 'On acquisition' },
    { from: 'Por su venta', to: 'On its sale' },
    { from: 'Por venta', to: 'On sale' },
    { from: 'Al cierre del ejercicio para saldar la cuenta de', to: 'At fiscal year end to close the account of' },
    { from: 'Al cierre del ejercicio para saldar la cuenta', to: 'At fiscal year end to close the account' },
    { from: 'Al cierre del ejercicio por el valor de las existencias finales', to: 'At year-end for final inventory value' },
    { from: 'Al cierre del ejercicio por el valor de las existencias iniciales', to: 'At year-end for initial inventory value' },
    { from: 'Al formalizar', to: 'Upon formalization' },
    { from: 'Por el cobro', to: 'For collection' },
    { from: 'Al cobrar', to: 'On collection of' },
    { from: 'Por el pago', to: 'On payment of' },
    { from: 'Por la baja', to: 'On write-off' },
    { from: 'A la suscripción', to: 'On subscription' },
    { from: 'contra Resultado del ejercicio', to: 'against Profit/Loss for the year' },
  ];
  for (const r of replaces) {
    res = res.replace(new RegExp(r.from, 'g'), r.to);
  }
  for (const k of Object.keys(ACCOUNT_MAPPING)) {
    res = res.replace(new RegExp(ACCOUNT_MAPPING[k], 'g'), ACCOUNT_MAPPING_EN[k] || ACCOUNT_MAPPING[k]);
  }
  return res;
};

const translateGameText = (text: string, type: string, lang: string) => {
  if (lang !== 'en') return text;
  if (type === 'Sección del balance' || type === 'Balance sheet section') {
    return SECTION_DISPLAY[text] || text;
  }
  if (type === 'Saldos posibles' || type === 'Possible balances' || type === 'Saldos') {
    return text.split(', ').map(s => BALANCE_DISPLAY[s] || s).join(', ');
  }
  if (type === 'Asiento contable' || type === 'Accounting entry') {
    return text.replace(/Debe/g, 'Debit').replace(/Haber/g, 'Credit');
  }
  return text;
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
  const prefix3 = code.substring(0, 3);

  // Group 1: Financiación básica
  if (firstDigit === '1') {
    // Patrimonio Neto: 100, 101, 102, 103, 112, 129 + subgrupos 10, 11, 12, 13, 19
    if (['100', '101', '102', '103', '112', '129'].includes(code) || ['10', '11', '12', '13', '19'].includes(prefix2)) {
      return { section: 'liabilitiesAndEquity', subSection: 'equity' };
    }
    // Pasivo No Corriente: 170, 173, 175, 180, 189 + resto grupo 1
    if (['170', '173', '175', '180', '189'].includes(code) || ['17', '18'].includes(prefix2)) {
      return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
    }
    // Default for Group 1 (RD 1514/2007)
    return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
  }

  // Group 2: Inmovilizado (Activo No Corriente)
  if (firstDigit === '2') return { section: 'assets', subSection: 'nonCurrent' };

  // Group 3: Existencias (Activo Corriente)
  if (firstDigit === '3') return { section: 'assets', subSection: 'current' };

  // Group 4: Acreedores y deudores
  if (firstDigit === '4') {
    if (code === '474') return { section: 'assets', subSection: 'nonCurrent' };
    if (code === '479') return { section: 'liabilitiesAndEquity', subSection: 'nonCurrent' };
    
    // Activo Corriente: 407, 430, 431, 433, 434, 435, 440, 472, 473
    if (['407', '430', '431', '433', '434', '435', '440', '472', '473'].includes(code)) {
      return { section: 'assets', subSection: 'current' };
    }
    // Pasivo Corriente: 400, 4004, 4009, 401, 403, 404, 405, 406, 410, 411, 438, 477
    if (['400', '4004', '4009', '401', '403', '404', '405', '406', '410', '411', '438', '477'].includes(code)) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }

    // Default Group 4 (RD 1514/2007)
    if (['40', '41', '46'].includes(prefix2) || ['475', '476', '477', '485'].includes(prefix3)) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }
    return { section: 'assets', subSection: 'current' };
  }

  // Group 5: Cuentas financieras
  if (firstDigit === '5') {
    // Activo Corriente: 530, 531, 540, 541, 542, 548, 558, 565, 570, 572, 573
    if (['530', '531', '540', '541', '542', '548', '558', '565', '570', '572', '573'].includes(code)) {
      return { section: 'assets', subSection: 'current' };
    }
    // Pasivo Corriente: 5200, 523, 525, 560, 569
    if (['5200', '523', '525', '560', '569'].includes(code)) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }

    // Default Group 5 (RD 1514/2007)
    if (['50', '51', '52', '55'].includes(prefix2) || code.startsWith('560') || code.startsWith('561')) {
      return { section: 'liabilitiesAndEquity', subSection: 'current' };
    }
    return { section: 'assets', subSection: 'current' };
  }

  // Group 6 & 7: PnL (Regularize in 129 - Equity)
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

const SYSTEM_INSTRUCTION_EN = `You are an expert Intelligent Accounting Tutor specialized in the General Chart of Accounts (PGC). Your goal is to help students understand the logic of accounting entries and double-entry bookkeeping.

CRITICAL RULES OF PEDAGOGY AND WORKFLOW (MANDATORY PROCEDURE FOR EACH ACCOUNT):
For each account that must take part in the entry, you must follow this STRICT order of questions:

1st FIRST, ASK FOR THE ACCOUNT: Ask which account records the transaction element in question (e.g., fruit, delivery truck, VAT, payment by card, etc.).
   - IF THE STUDENT IS WRONG: Explain what the account they erroneously suggested actually records, even if they were close.
   - DO NOT proceed to the next step until the student guesses the correct name and code of the account.
   - DO NOT add anything to the journal or change the balance sheet yet.

2nd SECOND, ASK FOR THE SIDE (DEBIT/CREDIT): Once the account is correct, ask if it is debited (Debe/Debit) or credited (Haber/Credit).
   - DO NOT proceed to the next step until the student guesses correctly.
   - DO NOT add anything to the journal or change the balance sheet yet.

3rd THIRD, ASK FOR THE AMOUNT: Once the side is correct, ask for the exact amount.
   - DO NOT proceed to the next step until the student guesses correctly.
   - DO NOT add anything to the journal or change the balance sheet yet.

4th FOURTH, RECORDING AND VISUAL UPDATE: Only when the student has successfully answered the above 3 points for that specific account:
   - Add the account with its amount to the [JOURNAL_DATA] block.
   - Update the [BALANCE_DATA] block with the new financial state corresponding to that change.
   - IF THE ELEMENT DID NOT EXIST IN THE BALANCE SHEET (e.g., selling something they do not own): Reflect the decrease in [BALANCE_DATA] all the same, leading to a negative amount.
   - Inform the student that the account has been recorded and proceed with the next account of the entry following the same 1-2-3-4 process.

ADDITIONAL RULES:
- ELEMENTS NOT PRESENT: If the student proposes a scenario with elements not present in the balance sheet, provide clues to help them answer questions 1, 2, and 3.
- SOCRATIC METHOD: Ask ONLY ONE QUESTION at a time.
- NEVER provide the full accounting entry or give away too much information in advance.
- SPEEDY RESPONSES: Be extremely concise. Avoid long introductions.

MANDATORY TECHNICAL FORMAT:
Always include the JSON blocks at the end. If an account has not completed all 4 steps, do NOT include it inside [JOURNAL_DATA] and do NOT modify [BALANCE_DATA].

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

const BalanceRow = ({ item, language = 'es' }: { item: BalanceItem, language?: 'es' | 'en', key?: React.Key }) => {
  const isEn = language === 'en';
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
    if (code.startsWith('472')) return true;
    if (code.startsWith('477')) return true;
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

  const isContra = isContraAccount(item.code || '');
  const is103Error = (item.code === '103' || (item.code && item.code.startsWith('103'))) && item.amount > 0;
  const isAmortizationError = (item.code === '280' || item.code === '281' || (item.code && (item.code.startsWith('280') || item.code.startsWith('281')))) && item.amount > 0;
  const showError = (isNegative && !isContra) || (item.code === '406' && item.amount > 0) || is103Error || isAmortizationError;
  const [showExplanation, setShowExplanation] = useState(false);
  
  const displayName = item.code 
    ? (isEn ? (ACCOUNT_MAPPING_EN[item.code] || item.name) : (ACCOUNT_MAPPING[item.code] || item.name)) 
    : item.name;

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
          {displayName}
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
                {isEn 
                  ? "Due to the nature of the account, this situation is not possible."
                  : "Por la naturaleza de la cuenta no es posible esta situación."}
              </p>
            </div>
            <button 
              onClick={() => setShowExplanation(!showExplanation)}
              className="text-[9px] font-bold text-red-700 hover:underline flex-shrink-0 ml-1"
            >
              {isEn ? "¿Why?" : "¿Por qué?"}
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
                  {item.code === '406' 
                    ? (isEn 
                        ? "Account 406 (Packaging to be returned to suppliers) is a debit account and appears as a reduction of liabilities. Therefore, it cannot have a credit balance (positive in liabilities)."
                        : "La cuenta 406 (Envases y embalajes a devolver a proveedores) tiene naturaleza deudora y figura minorando el pasivo. Por tanto, no puede tener saldo acreedor (positivo en el pasivo).")
                    : item.code === '103' || (item.code && item.code.startsWith('103'))
                    ? (isEn
                        ? "Account 103 (Uncalled capital) represents a claim against partners and has a debit nature. Under Equity, it must appear as a negative deduction. It cannot have a credit balance (positive in Equity)."
                        : "La cuenta 103 (Socios por desembolsos no exigidos) representa un derecho de cobro sobre los socios y tiene naturaleza deudora. Al figurar en el Patrimonio Neto de la empresa, debe aparecer con signo negativo (restando). Por lo tanto, no puede quedar en un valor positivo (saldo acreedor).")
                    : item.code === '280' || item.code === '281' || (item.code && (item.code.startsWith('280') || item.code.startsWith('281')))
                    ? (isEn
                        ? "Accumulated depreciation accounts (280/281) have a credit nature and must appear in Non-current Assets with a negative sign (decreasing asset value). Therefore, they cannot have a positive balance (debit balance)."
                        : "Las cuentas de amortización acumulada (280/281) tienen naturaleza acreedora y deben figurar en el Activo No Corriente restando (con signo deudor negativo). Por tanto, no pueden quedar en un valor positivo.")
                    : (isEn 
                        ? "In accounting, an account cannot reflect a negative amount of a physical asset or a right. If this occurs, it is usually due to an error in recording initial inventory or a transaction (such as a sale or payment) of something that was not previously part of the company's assets."
                        : "Contablemente, una cuenta no puede reflejar una cantidad negativa de un bien físico o un derecho. Si esto ocurre, suele deudarse a un error en el registro de las existencias iniciales o a una operación (como una venta o pago) de algo que no consta previamente en el patrimonio de la empresa.")
                  }
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const BalanceSectionEditor = ({ title, items, onAdd, onRemove, onUpdate, validationErrors, language = 'es' }: { 
  title: string, 
  items: BalanceItem[], 
  onAdd: () => void, 
  onRemove: (idx: number) => void,
  onUpdate: (idx: number, field: keyof BalanceItem, value: any) => void,
  validationErrors?: { idx: number, fields: string[] }[],
  language?: 'es' | 'en'
}) => {
  const isEn = language === 'en';
  return (
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
                placeholder={isEn ? "Code" : "Cód."} 
                value={item.code} 
                onChange={(e) => onUpdate(idx, 'code', e.target.value)}
                className={`w-12 text-[10px] p-1 border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none ${errors.includes('code') ? 'border-red-500 bg-red-50' : 'border-zinc-200'}`}
              />
              <input 
                type="text" 
                placeholder={isEn ? "Account name" : "Nombre de la cuenta"} 
                value={item.name} 
                onChange={(e) => onUpdate(idx, 'name', e.target.value)}
                className={`flex-1 text-[11px] p-1 border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none ${errors.includes('name') ? 'border-red-500 bg-red-50' : 'border-zinc-200'}`}
              />
              <input 
                type="number" 
                placeholder={isEn ? "Amount" : "Importe"} 
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
        {items.length === 0 && (
          <p className="text-[10px] text-zinc-300 italic py-2">
            {isEn ? "No items" : "No hay elementos"}
          </p>
        )}
      </div>
    </div>
  );
};


export default function App() {
  const [language, setLanguage] = useState<'es' | 'en'>('es');
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
  const [isPizarraMode, setIsPizarraMode] = useState(true);
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [isDigitalWhiteboardOpen, setIsDigitalWhiteboardOpen] = useState(false);
  const [whiteboardPages, setWhiteboardPages] = useState<any[]>([{ shapes: [], scale: 1, position: { x: 0, y: 0 } }]);
  const [whiteboardCurrentPageIndex, setWhiteboardCurrentPageIndex] = useState(0);
  const [pizarraColumns, setPizarraColumns] = useState<1 | 2>(2);
  const [showPizarraBalance, setShowPizarraBalance] = useState(true);
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

  // Refactored casual individual review game states
  const [gameMode, setGameMode] = useState<'casual' | 'time_attack'>('casual');
  const [gameStreak, setGameStreak] = useState(0);
  const [gameMaxStreak, setGameMaxStreak] = useState(0);
  const [gameQuestionIndex, setGameQuestionIndex] = useState(1);
  const [gameOptions, setGameOptions] = useState<string[]>([]);
  const [gameCorrectOption, setGameCorrectOption] = useState('');
  const [gameSelectedOption, setGameSelectedOption] = useState<string | null>(null);
  const [currentGameQuestionType, setCurrentGameQuestionType] = useState<'def_to_account' | 'account_to_def'>('def_to_account');
  
  // Game enhancements (XP, Audio & Ranks)
  const [gameAudioMuted, setGameAudioMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('contabilidad_game_audio_muted') === 'true';
    } catch {
      return false;
    }
  });

  const [totalXP, setTotalXP] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('accounting_total_xp')) || 0;
    } catch {
      return 0;
    }
  });

  const [showRankInfo, setShowRankInfo] = useState(false);
  const [xpEarnedThisMatch, setXpEarnedThisMatch] = useState(0);

  const getPlayerRank = (score: number, isEn: boolean) => {
    if (score >= 300) return isEn ? "✨ Financial Guru ✨" : "✨ Gurú Financiero ✨";
    if (score >= 200) return isEn ? "🔍 Master Auditor 🔍" : "🔍 Auditor Certificado 🔍";
    if (score >= 100) return isEn ? "⚡ Senior Ledger Master ⚡" : "⚡ Tenedor de Libros Senior ⚡";
    if (score >= 50) return isEn ? "📊 Account Specialist 📊" : "📊 Especialista Contable 📊";
    return isEn ? "🎓 Accounting Apprentice" : "🎓 Aprendiz de Contabilidad";
  };

  const getRankColor = (score: number) => {
    if (score >= 300) return "from-amber-500 to-orange-500 text-amber-600 bg-amber-50 border-amber-200";
    if (score >= 200) return "from-purple-500 to-pink-500 text-purple-600 bg-purple-50 border-purple-200";
    if (score >= 100) return "from-blue-500 to-indigo-500 text-blue-600 bg-blue-50 border-blue-200";
    if (score >= 50) return "from-emerald-500 to-teal-500 text-emerald-600 bg-emerald-50 border-emerald-200";
    return "from-zinc-500 to-slate-500 text-zinc-600 bg-zinc-50 border-zinc-200";
  };

  const playSynthSound = (type: 'click' | 'correct' | 'wrong' | 'streak' | 'gameover') => {
    if (gameAudioMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(290, now + 0.08);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.18); // C6
        gainNode.gain.setValueAtTime(0.18, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'streak') {
        // High-pitched retro positive chime! Double sweet beep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.07); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.14); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.21); // C6
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.setValueAtTime(0.15, now + 0.07);
        gainNode.gain.setValueAtTime(0.15, now + 0.14);
        gainNode.gain.setValueAtTime(0.2, now + 0.21);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.36);
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.28);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'gameover') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(165, now + 0.5);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.55);
      }
    } catch (err) {
      // Audio context might be restricted or unsupported on first render, swallow error gracefully
    }
  };
  
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
      language,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('contaia_session', JSON.stringify(sessionData));
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
        if (data.language) setLanguage(data.language);
        if (data.whiteboardPages) {
          const migratedPages = data.whiteboardPages.map((page: any) => {
            if (Array.isArray(page)) {
              return { shapes: page, scale: 1, position: { x: 0, y: 0 } };
            }
            return page;
          });
          setWhiteboardPages(migratedPages);
        }
        if (data.whiteboardCurrentPageIndex !== undefined) setWhiteboardCurrentPageIndex(data.whiteboardCurrentPageIndex);
      } catch (e) {
        console.error("Error loading session", e);
      }
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const resetSession = () => {
    localStorage.removeItem('contaia_session');
    setMessages([
      {
        id: '1',
        role: 'bot',
        text: language === 'en' 
          ? 'Hi! I am your Accounting Professor. I have prepared an initial balance sheet for today. What transaction would you like to work on?'
          : '¡Hola! Soy tu Profesor de Contabilidad. He preparado un balance inicial para hoy. ¿En qué operación te gustaría trabajar?',
        timestamp: new Date(),
        balance: INITIAL_BALANCE
      }
    ]);
    setCurrentBalance(INITIAL_BALANCE);
    setTargetBalance(INITIAL_BALANCE);
    setCurrentJournal([]);
    setWhiteboardPages([{ shapes: [], scale: 1, position: { x: 0, y: 0 } }]);
    setWhiteboardCurrentPageIndex(0);
    setShowResetConfirm(false);
    setShowToast({ 
      message: language === 'en' ? 'Session reset successfully' : 'Sesión reiniciada correctamente', 
      type: 'success' 
    });
    setTimeout(() => setShowToast(null), 3000);
  };

  // Auto-load on mount
  useEffect(() => {
    loadSession(true);
  }, []);

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSession(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, currentBalance, currentJournal, fontScale, balanceFontScale, journalFontScale, pizarraColumns, pizarraSplit, whiteboardPages, whiteboardCurrentPageIndex, language]);

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
          systemInstruction: language === 'en' ? SYSTEM_INSTRUCTION_EN : SYSTEM_INSTRUCTION,
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
    const initializeBalance = (bal: BalanceState, lang: 'es' | 'en'): BalanceState => {
      const clone = JSON.parse(JSON.stringify(bal));
      const convertList = (list: BalanceItem[]) => {
        return list.map(item => {
          if (item.code) {
            const mappedName = lang === 'en' 
              ? (ACCOUNT_MAPPING_EN[item.code] || item.name)
              : (ACCOUNT_MAPPING[item.code] || item.name);
            return { ...item, name: mappedName };
          }
          return item;
        });
      };
      
      clone.assets.nonCurrent = convertList(clone.assets.nonCurrent);
      clone.assets.current = convertList(clone.assets.current);
      clone.liabilitiesAndEquity.equity = convertList(clone.liabilitiesAndEquity.equity);
      clone.liabilitiesAndEquity.nonCurrent = convertList(clone.liabilitiesAndEquity.nonCurrent);
      clone.liabilitiesAndEquity.current = convertList(clone.liabilitiesAndEquity.current);
      return clone;
    };

    const [tempBalance, setTempBalance] = useState<BalanceState>(() => initializeBalance(currentBalance, language));

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
        const mappingToUse = language === 'en' ? ACCOUNT_MAPPING_EN : ACCOUNT_MAPPING;
        if (mappingToUse[value]) {
          item.name = mappingToUse[value];
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
          const expectedName = language === 'en' ? ACCOUNT_MAPPING_EN[item.code] : ACCOUNT_MAPPING[item.code];
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
        text: language === 'en'
          ? 'Balance updated! I have registered your custom initial balance sheet. What accounting operation would you like to perform next?'
          : '¡Balance actualizado! He tomado nota de tu balance inicial personalizado. ¿Qué operación te gustaría realizar ahora?',
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
                <h2 className="text-xl font-bold text-zinc-900">
                  {language === 'en' ? 'Customize Initial Balance' : 'Personalizar Balance Inicial'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {language === 'en' ? 'Configure starting accounts and balances' : 'Configura las cuentas y saldos de partida'}
                </p>
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
                  <h3 className="text-lg font-black text-emerald-600 uppercase tracking-widest">
                    {language === 'en' ? 'Assets' : 'Activo'}
                  </h3>
                </div>
                <div className="space-y-8">
                  <BalanceSectionEditor 
                    title={language === 'en' ? 'Non-Current Assets' : 'Activo No Corriente'} 
                    items={tempBalance.assets.nonCurrent} 
                    onAdd={() => addItem('assets', 'nonCurrent')}
                    onRemove={(idx) => removeItem('assets', 'nonCurrent', idx)}
                    onUpdate={(idx, f, v) => updateItem('assets', 'nonCurrent', idx, f, v)}
                    validationErrors={assetNonCurrentErrors}
                    language={language}
                  />
                  <BalanceSectionEditor 
                    title={language === 'en' ? 'Current Assets' : 'Activo Corriente'} 
                    items={tempBalance.assets.current} 
                    onAdd={() => addItem('assets', 'current')}
                    onRemove={(idx) => removeItem('assets', 'current', idx)}
                    onUpdate={(idx, f, v) => updateItem('assets', 'current', idx, f, v)}
                    validationErrors={assetCurrentErrors}
                    language={language}
                  />
                </div>
              </div>

              {/* Liabilities Column */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b-2 border-blue-500 pb-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-black text-blue-600 uppercase tracking-widest">
                    {language === 'en' ? 'Equity & Liabilities' : 'Patrimonio Neto + Pasivo'}
                  </h3>
                </div>
                <div className="space-y-8">
                  <BalanceSectionEditor 
                    title={language === 'en' ? 'Equity' : 'Patrimonio Neto'} 
                    items={tempBalance.liabilitiesAndEquity.equity} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'equity')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'equity', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'equity', idx, f, v)}
                    validationErrors={equityErrors}
                    language={language}
                  />
                  <BalanceSectionEditor 
                    title={language === 'en' ? 'Non-Current Liabilities' : 'Pasivo No Corriente'} 
                    items={tempBalance.liabilitiesAndEquity.nonCurrent} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'nonCurrent')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'nonCurrent', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'nonCurrent', idx, f, v)}
                    validationErrors={liabilityNonCurrentErrors}
                    language={language}
                  />
                  <BalanceSectionEditor 
                    title={language === 'en' ? 'Current Liabilities' : 'Pasivo Corriente'} 
                    items={tempBalance.liabilitiesAndEquity.current} 
                    onAdd={() => addItem('liabilitiesAndEquity', 'current')}
                    onRemove={(idx) => removeItem('liabilitiesAndEquity', 'current', idx)}
                    onUpdate={(idx, f, v) => updateItem('liabilitiesAndEquity', 'current', idx, f, v)}
                    validationErrors={liabilityCurrentErrors}
                    language={language}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex flex-col gap-2">
                <div className="flex gap-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">
                      {language === 'en' ? 'Total Assets' : 'Total Activo'}
                    </span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(tempTotalAssets)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">
                      {language === 'en' ? 'Total Eq. + Liab.' : 'Total P.N. + Pasivo'}
                    </span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-blue-600'}`}>
                      {formatCurrency(tempTotalLiabilities)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">
                      {language === 'en' ? 'Difference' : 'Diferencia'}
                    </span>
                    <span className={`text-xl font-black ${isUnbalanced ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(tempTotalAssets - tempTotalLiabilities)}
                    </span>
                  </div>
                </div>
                {isUnbalanced && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {language === 'en' ? 'The initial balance sheet must be balanced before saving.' : 'El balance inicial debe estar cuadrado para poder guardar.'}
                  </p>
                )}
                {hasAnyFieldErrors && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {language === 'en' ? 'Please review fields highlighted in red (empty or invalid code/name).' : 'Revisa los campos marcados en rojo (vacíos o con errores de código/nombre).'}
                  </p>
                )}
                {hasMismatchError && (
                  <p className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {language === 'en' ? 'The account number and name do not match according to the PGC.' : 'El número de cuenta y el nombre no coinciden según el PGC.'}
                  </p>
                )}
             </div>
             <div className="flex gap-3">
                <button 
                  onClick={() => setTempBalance({ assets: { nonCurrent: [], current: [] }, liabilitiesAndEquity: { equity: [], nonCurrent: [], current: [] } })}
                  className="px-4 py-2 text-zinc-500 font-bold hover:text-zinc-700 transition-colors text-sm"
                >
                  {language === 'en' ? 'Start from scratch' : 'Empezar de cero'}
                </button>
                <button 
                  onClick={handleSave}
                  disabled={hasAnyFieldErrors || isUnbalanced}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95"
                >
                  {language === 'en' ? 'Save final balance' : 'Guardar balance final'}
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
            <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">
              {language === 'en' ? 'Reset session?' : '¿Reiniciar sesión?'}
            </h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              {language === 'en' 
                ? 'This action will clear all your messages, accounting entries, and the current state of the balance sheet.' 
                : 'Esta acción borrará todos tus mensajes, asientos contables y el estado actual del balance.'} 
              <span className="block font-bold text-red-600 mt-1">
                {language === 'en' ? 'This cannot be undone.' : 'No se puede deshacer.'}
              </span>
            </p>
          </div>
          <div className="flex gap-3 w-full mt-4">
            <button 
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-2xl font-bold transition-all"
            >
              {language === 'en' ? 'Cancel' : 'Cancelar'}
            </button>
            <button 
              onClick={resetSession}
              className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-lg shadow-red-200 transition-all"
            >
              {language === 'en' ? 'Yes, reset' : 'Sí, reiniciar'}
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
    if (['129', '610', '611', '612', '710', '711', '712', '713', '472', '477'].includes(code)) {
      results.push('Saldo deudor', 'Saldo acreedor');
      return results;
    }

    // Deudor balance (Assets and Expenses)
    const isDeudor = 
      firstDigit === '2' || 
      firstDigit === '3' || 
      (firstDigit === '6' && !['606', '608', '609', '610', '611', '612'].includes(code)) ||
      ['706', '708', '709'].includes(code) ||
      ['430', '431', '433', '434', '435', '440', '472', '473'].includes(code) ||
      ['407', '530', '531', '540', '541', '542', '548', '558', '565', '570', '572', '573', '406'].includes(code) ||
      ['103'].includes(code); // Negative in Equity

    // Acreedor balance (Liabilities, Equity and Income)
    const isAcreedor = 
      (firstDigit === '1' && !['103', '129'].includes(code)) ||
      (firstDigit === '7' && !['706', '708', '709', '710', '711', '712', '713'].includes(code)) ||
      ['606', '608', '609'].includes(code) ||
      ['400', '4004', '4009', '401', '403', '404', '405', '410', '411', '438'].includes(code) ||
      ['5200', '523', '525', '560', '569'].includes(code);

    if (isDeudor) results.push('Saldo deudor');
    if (isAcreedor) results.push('Saldo acreedor');
    
    return results;
  };

  // Game logic
  // Game logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStatus === 'playing' && gameTimer > 0 && lastAnswerCorrect === null) {
      if (gameMode === 'time_attack') {
        interval = setInterval(() => {
          setGameTimer(prev => {
            if (prev <= 1) {
              setGameStatus('gameover');
              setPlayerName('');
              setIsScoreSaved(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }
    return () => clearInterval(interval);
  }, [gameStatus, gameTimer, lastAnswerCorrect, gameMode]);

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

  // Helper helper to get definitions for game
  const getAccountDefinition = (code: string, lang: 'es' | 'en'): string => {
    if (ACCOUNT_DEFINITIONS[code]) {
      return lang === 'en' ? ACCOUNT_DEFINITIONS[code].en : ACCOUNT_DEFINITIONS[code].es;
    }
    const name = lang === 'en' ? (ACCOUNT_MAPPING_EN[code] || code) : (ACCOUNT_MAPPING[code] || code);
    return lang === 'en'
      ? `Register or track operations corresponding to the account: ${name}.`
      : `Registrar y realizar el seguimiento de las operaciones de la cuenta: ${name}.`;
  };

  // Modern helper to shuffle arrays
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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

    // Randomize sub question type: 50% Definition to Account, 50% Account to Definition
    const type = Math.random() > 0.5 ? 'def_to_account' : 'account_to_def';
    setCurrentGameQuestionType(type);
    setGameSelectedOption(null);
    setLastAnswerCorrect(null);

    // Pick localized representations for prompt and options
    const localizedTargetName = language === 'en' ? (ACCOUNT_MAPPING_EN[randomAccount.code] || randomAccount.name) : randomAccount.name;
    const correctDef = getAccountDefinition(randomAccount.code, language);

    if (type === 'def_to_account') {
      setCurrentQuestionText(correctDef);
      
      // Correct Option: Account indicator
      const correctOpt = `${randomAccount.code} - ${localizedTargetName}`;
      setGameCorrectOption(correctOpt);

      // Distractors
      const pool = accounts.filter(a => a.code !== randomAccount.code);
      const shuffledPool = shuffleArray(pool);
      const distractors = shuffledPool.slice(0, Math.min(3, shuffledPool.length)).map(a => {
        const dName = language === 'en' ? (ACCOUNT_MAPPING_EN[a.code] || a.name) : a.name;
        return `${a.code} - ${dName}`;
      });

      // Shuffled set of 4 choices
      const finalOpts = shuffleArray([correctOpt, ...distractors]);
      setGameOptions(finalOpts);

    } else {
      setCurrentQuestionText(`${randomAccount.code} - ${localizedTargetName}`);
      
      // Correct Option: Definition
      setGameCorrectOption(correctDef);

      // Distractors
      const pool = accounts.filter(a => a.code !== randomAccount.code);
      const shuffledPool = shuffleArray(pool);
      const distractors = shuffledPool.slice(0, Math.min(3, shuffledPool.length)).map(a => getAccountDefinition(a.code, language));

      // Shuffled set of 4 choices
      const finalOpts = shuffleArray([correctDef, ...distractors]);
      setGameOptions(finalOpts);
    }
  };

  const handleWrongAnswer = (message?: string) => {
    // Legacy fallback, logic merged to submitAnswer
  };

  const startGame = () => {
    if (gameSelectedModules.length === 0) {
      setShowToast({ 
        message: language === 'en' 
          ? "Select at least one module to start" 
          : "Selecciona al menos un módulo para empezar", 
        type: 'error' 
      });
      return;
    }
    setGameScore(0);
    setGameStreak(0);
    setGameMaxStreak(0);
    setGameQuestionIndex(1);
    setGameStatus('playing');
    setAskedQuestionCodes([]);
    setMissedQuestions([]);
    setGameSelectedOption(null);
    setLastAnswerCorrect(null);

    if (gameMode === 'time_attack') {
      setGameLives(3);
      setGameTimer(300); // 5 minutes Time Attack!
    } else {
      setGameLives(5); // In practice mode, we can show a relaxed indicator
      setGameTimer(0);
    }

    // Delay a bit or execute instantly
    generateQuestion([]);
  };

  const submitAnswer = (selectedOpt: string) => {
    if (gameSelectedOption !== null || lastAnswerCorrect !== null) return;
    setGameSelectedOption(selectedOpt);

    const isCorrect = selectedOpt === gameCorrectOption;
    if (isCorrect) {
      setLastAnswerCorrect(true);
      const newStreak = gameStreak + 1;
      setGameStreak(newStreak);
      setGameMaxStreak(prev => Math.max(prev, newStreak));

      const points = 10 + (newStreak >= 3 ? 5 : 0); // Bonus points for streak
      const currentFinalScore = gameScore + points;
      setGameScore(currentFinalScore);

      // Play correct sounds and streak cues
      if (newStreak >= 3) {
        playSynthSound('streak');
      } else {
        playSynthSound('correct');
      }

      setTimeout(() => {
        // Advance
        if (gameMode === 'casual' && gameQuestionIndex >= 15) {
          const matchXp = currentFinalScore * 10;
          setXpEarnedThisMatch(matchXp);
          setTotalXP(prev => {
            const nextXp = prev + matchXp;
            try {
              localStorage.setItem('accounting_total_xp', String(nextXp));
            } catch (e) {}
            return nextXp;
          });
          playSynthSound('gameover');
          setGameStatus('gameover');
          setPlayerName('');
          setIsScoreSaved(false);
        } else {
          setGameQuestionIndex(prev => prev + 1);
          generateQuestion();
        }
      }, 1500);

    } else {
      setLastAnswerCorrect(false);
      setGameStreak(0);
      playSynthSound('wrong');

      const targetLabel = language === 'en' ? 'Correct answer: ' : 'Respuesta correcta: ';
      setShowToast({
        message: `${targetLabel} ${gameCorrectOption}`,
        type: 'error'
      });

      // Register missed
      setMissedQuestions(prev => [...prev, {
        question: currentGameQuestionType === 'def_to_account'
          ? (language === 'en' ? `What account records: "${currentQuestionText}"?` : `¿Qué cuenta recoge lo siguiente?: "${currentQuestionText}"?`)
          : (language === 'en' ? `What records the account: "${currentQuestion?.code} - ${(language === 'en' ? (ACCOUNT_MAPPING_EN[currentQuestion?.code || ''] || currentQuestion?.name) : currentQuestion?.name)}"?` : `¿Qué recoge la cuenta: "${currentQuestion?.code} - ${currentQuestion?.name}"?`),
        code: currentQuestion?.code || '',
        correctAnswer: gameCorrectOption,
        userAnswer: selectedOpt,
        type: currentGameQuestionType === 'def_to_account'
          ? (language === 'en' ? 'Definition to Account' : 'Definición a Cuenta')
          : (language === 'en' ? 'Account to Definition' : 'Cuenta a Definición')
      }]);

      let willBeGameOver = false;

      if (gameMode === 'time_attack') {
        const nextLives = gameLives - 1;
        setGameLives(nextLives);
        if (nextLives <= 0) {
          willBeGameOver = true;
          const matchXp = gameScore * 10;
          setXpEarnedThisMatch(matchXp);
          setTotalXP(prev => {
            const nextXp = prev + matchXp;
            try {
              localStorage.setItem('accounting_total_xp', String(nextXp));
            } catch (e) {}
            return nextXp;
          });
          playSynthSound('gameover');
          setTimeout(() => {
            setGameStatus('gameover');
            setPlayerName('');
            setIsScoreSaved(false);
          }, 2000);
        }
      }

      if (!willBeGameOver) {
        setTimeout(() => {
          if (gameMode === 'casual' && gameQuestionIndex >= 15) {
            const matchXp = gameScore * 10;
            setXpEarnedThisMatch(matchXp);
            setTotalXP(prev => {
              const nextXp = prev + matchXp;
              try {
                localStorage.setItem('accounting_total_xp', String(nextXp));
              } catch (e) {}
              return nextXp;
            });
            playSynthSound('gameover');
            setGameStatus('gameover');
            setPlayerName('');
            setIsScoreSaved(false);
          } else {
            setGameQuestionIndex(prev => prev + 1);
            generateQuestion();
          }
        }, 2500);
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

    const isEn = language === 'en';

    return (
      <div className="min-h-screen bg-zinc-50 font-sans p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-sm">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  playSynthSound('click');
                  if (gameStatus === 'playing') {
                    if (confirm(isEn ? 'Are you sure you want to exit the current game?' : '¿Seguro que deseas salir de la partida actual?')) {
                      setGameStatus('selection');
                    }
                  } else {
                    setCurrentView('home');
                  }
                }}
                className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200 hover:bg-zinc-100 transition-all shrink-0"
              >
                <X className="w-5 h-5 text-zinc-600" />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight uppercase">
                    {isEn ? 'Account Quiz Arena' : 'Arena de Repaso de Cuentas'}
                  </h2>
                  <div className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm shadow-emerald-200">
                    ⭐ NV. {Math.floor(Math.sqrt(totalXP / 100)) + 1}
                  </div>
                </div>
                <p className="text-xs text-zinc-500 font-bold font-mono mt-0.5">
                  {getPlayerRank(totalXP / 10, isEn)} ({totalXP} XP)
                </p>
              </div>
            </div>

            {/* Sound Toggle & Stats */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                onClick={() => {
                  const nextMuted = !gameAudioMuted;
                  setGameAudioMuted(nextMuted);
                  try {
                    localStorage.setItem('contabilidad_game_audio_muted', String(nextMuted));
                  } catch (e) {}
                  if (!nextMuted) {
                    // Play a quick test sound
                    setTimeout(() => playSynthSound('click'), 50);
                  }
                }}
                className={`p-2.5 rounded-xl border transition-all ${
                  gameAudioMuted 
                    ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' 
                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
                title={isEn ? "Toggle Sound" : "Activar/Desactivar Sonido"}
              >
                {gameAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {gameStatus === 'playing' && (
                <div className="flex items-center gap-3">
                  {/* Timer / Progress */}
                  {gameMode === 'time_attack' ? (
                    <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-2xl border border-amber-100">
                      <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                      <span className="text-sm font-black text-amber-800 font-mono">
                        {Math.floor(gameTimer / 60)}:{(gameTimer % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-zinc-100 px-4 py-2 rounded-2xl font-black text-zinc-700 font-mono text-xs">
                      {isEn ? `Q: ${gameQuestionIndex}/15` : `Pregunta: ${gameQuestionIndex}/15`}
                    </div>
                  )}

                  {/* Score */}
                  <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 text-emerald-800">
                    <Trophy className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-black font-mono">{gameScore} pts</span>
                  </div>

                  {/* Streak */}
                  {gameStreak >= 2 && (
                    <div className="flex items-center gap-1.5 bg-orange-100 text-orange-800 px-3 py-1.5 rounded-full border border-orange-200 text-xs font-black uppercase animate-bounce">
                      🔥 x{gameStreak}
                    </div>
                  )}

                  {/* Lives only for Time Attack */}
                  {gameMode === 'time_attack' && (
                    <div className="flex items-center gap-1">
                      {[...Array(3)].map((_, i) => (
                        <Heart 
                          key={i} 
                          className={`w-4 h-4 transition-all ${i < gameLives ? 'text-red-500 fill-red-500 scale-110' : 'text-zinc-200'}`} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {gameStatus === 'selection' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid md:grid-cols-2 gap-8"
            >
              {/* Left Column: Game Setup */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-zinc-100 space-y-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-black tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2.5 py-1 rounded-full">
                    {isEn ? 'STEP 1' : 'PASO 1'}
                  </span>
                  <h3 className="text-lg font-black text-zinc-950 uppercase tracking-tight pt-1">
                    {isEn ? 'Select Modules' : 'Selecciona Módulos'}
                  </h3>
                  <p className="text-xs text-zinc-400 font-medium">
                    {isEn ? 'Choose which module accounts to include in the quiz pool' : 'Especifica qué módulos repasar en el juego'}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <label 
                    className={`flex items-center justify-between p-4 pl-3 rounded-2xl border-2 cursor-pointer transition-all ${
                      gameSelectedModules.length === 5 
                        ? 'border-emerald-600 bg-emerald-50/60 shadow-sm' 
                        : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'
                    }`}
                    onClick={() => playSynthSound('click')}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        gameSelectedModules.length === 5 ? 'bg-emerald-600 border-emerald-600' : 'border-zinc-300 bg-white'
                      }`}>
                        {gameSelectedModules.length === 5 && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="font-extrabold text-zinc-900 text-xs uppercase tracking-tight">
                        {isEn ? 'Financial Accounting I (All Modules)' : 'Contabilidad Financiera I (Todos)'}
                      </span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[1, 2, 3, 4, 5].map(m => (
                      <label 
                        key={m} 
                        className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                          gameSelectedModules.includes(m) 
                            ? 'border-emerald-500 bg-emerald-50/30' 
                            : 'border-zinc-100 bg-zinc-50/50 hover:border-zinc-200'
                        }`}
                        onClick={() => playSynthSound('click')}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            gameSelectedModules.includes(m) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 bg-white'
                          }`}>
                            {gameSelectedModules.includes(m) && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-xs font-bold text-zinc-800">
                            {isEn ? `Module ${m}` : `Módulo ${m}`}
                          </span>
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
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2.5 py-1 rounded-full">
                      {isEn ? 'STEP 2' : 'PASO 2'}
                    </span>
                    <h3 className="text-lg font-black text-zinc-950 uppercase tracking-tight pt-1">
                      {isEn ? 'Game Mode' : 'Modo de Juego'}
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium">
                      {isEn ? 'Select a casual study or time-attack method' : 'Configura tu estilo de repaso'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        playSynthSound('click');
                        setGameMode('casual');
                      }}
                      className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all ${
                        gameMode === 'casual'
                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 shadow-sm scale-[1.01]'
                          : 'border-zinc-100 bg-white hover:border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-emerald-800">
                        <span>🎓</span>
                        <span>{isEn ? 'Relaxed Practice' : 'Práctica Relajada'}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-semibold mt-1 leading-normal">
                        {isEn ? '15 randomized questions focusing strictly on account descriptions. Direct, self-paced, infinite lives.' : '15 preguntas aleatorias enfocadas en repasos de definiciones. Sin tiempo, con ritmo propio.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playSynthSound('click');
                        setGameMode('time_attack');
                      }}
                      className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all ${
                        gameMode === 'time_attack'
                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 shadow-sm scale-[1.01]'
                          : 'border-zinc-100 bg-white hover:border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-amber-600">
                        <span>⚡</span>
                        <span>{isEn ? 'Time Attack (5 Minutes)' : 'Contra Reloj (5 Minutos)'}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-semibold mt-1 leading-normal">
                        {isEn ? 'A dynamic 5-minute single-player countdown with 3 lives. Get as many points as possible before the timer runs out!' : 'Batalla contra el reloj de 5 minutos individuales con 3 vidas. ¡Verifica cuántas clavas antes de que expire el tiempo!'}
                      </p>
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    playSynthSound('click');
                    startGame();
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-200/50 transition-all flex items-center justify-center gap-2 tracking-widest uppercase mt-4 active:scale-95 cursor-pointer"
                >
                  <span>🎮</span>
                  <span>{isEn ? 'START DESAFÍO' : 'COMENZAR DESAFÍO'}</span>
                </button>
              </div>

              {/* Right Column: Profile Mastery & Rankings */}
              <div className="space-y-6">
                {/* Visual Level & XP Card */}
                {(() => {
                  const currentLevel = Math.floor(Math.sqrt(totalXP / 100)) + 1;
                  const xpForCurrentLevel = (currentLevel - 1) * (currentLevel - 1) * 100;
                  const xpForNextLevel = currentLevel * currentLevel * 100;
                  const progressValue = totalXP - xpForCurrentLevel;
                  const progressLimit = xpForNextLevel - xpForCurrentLevel;
                  const levelProgressPercent = progressLimit === 0 ? 0 : Math.min(100, Math.floor((progressValue / progressLimit) * 100));

                  return (
                    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white p-7 rounded-[2.5rem] shadow-xl space-y-5 border border-zinc-800 relative overflow-hidden">
                      {/* background ambient decoration */}
                      <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[9px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800">
                            {isEn ? 'ACCOUNTING LEVEL' : 'NIVEL DE CUENTAS'}
                          </span>
                          <h4 className="text-xl font-black tracking-tight uppercase mt-1">
                            {isEn ? `Rank: Level ${currentLevel}` : `Nivel: ${currentLevel}`}
                          </h4>
                        </div>
                        <span className="text-4xl">🏆</span>
                      </div>

                      {/* Rank ribbon */}
                      <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/80 text-xs font-bold text-zinc-300">
                        👑 {getPlayerRank(totalXP / 10, isEn)}
                      </div>

                      {/* Cumulative Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 font-extrabold">
                          <span>{totalXP} XP acumulados</span>
                          <span>{xpForNextLevel} XP para Niv. {currentLevel + 1}</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${levelProgressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 block text-right font-mono uppercase tracking-wider">
                          {levelProgressPercent}% completado
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-zinc-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-zinc-400" />
                      <h3 className="text-lg font-black text-zinc-950 uppercase tracking-tight">
                        {isEn ? 'Personal Records' : 'Clasificaciones Personales'}
                      </h3>
                    </div>
                    {gameHistory.length > 0 && (
                      <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl">
                        <button 
                          onClick={() => {
                            playSynthSound('click');
                            if (gameSortCriteria === 'date') setGameSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                            else { setGameSortCriteria('date'); setGameSortDirection('desc'); }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                            gameSortCriteria === 'date' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                          }`}
                        >
                          {isEn ? 'Date' : 'Fecha'} {gameSortCriteria === 'date' && (gameSortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button 
                          onClick={() => {
                            playSynthSound('click');
                            if (gameSortCriteria === 'score') setGameSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                            else { setGameSortCriteria('score'); setGameSortDirection('desc'); }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                            gameSortCriteria === 'score' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                          }`}
                        >
                          {isEn ? 'Points' : 'Puntos'} {gameSortCriteria === 'score' && (gameSortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </div>
                    )}
                  </div>
                {gameHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-400 space-y-3">
                    <Trophy className="w-12 h-12 opacity-25" />
                    <p className="font-semibold text-sm">
                      {isEn ? 'No game matches logged yet' : 'Aún no se registran partidas'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {sortedHistory.map((entry, i) => {
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
                                  <span className="text-sm font-black text-zinc-900">
                                    {entry.name || (isEn ? 'Anonymous' : 'Anónimo')}
                                  </span>
                                  <button 
                                    onClick={() => {
                                      setEditingHistoryIndex(originalIndex);
                                      setEditingHistoryName(entry.name || (isEn ? 'Anonymous' : 'Anónimo'));
                                    }}
                                    className="p-1 text-zinc-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-all"
                                    title={isEn ? 'Edit name' : 'Editar nombre'}
                                  >
                                    <Settings className="w-3 h-3" />
                                  </button>
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{entry.date}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-zinc-600">
                              {entry.modules.length === 5 
                                ? (isEn ? 'Financial Accounting I' : 'Contabilidad Financiera I') 
                                : (isEn ? `Modules: ${entry.modules.join(', ')}` : `Módulos: ${entry.modules.join(', ')}`)}
                            </span>
                          </div>
                          <span className="text-xl font-black text-emerald-600 shrink-0">{entry.score}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

          {gameStatus === 'playing' && currentQuestion && (
            <motion.div 
              key={currentQuestion.code}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-zinc-100 space-y-8 relative overflow-hidden">
                {/* Visual Game Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-zinc-100">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300"
                    style={{ width: `${(Math.min(15, gameQuestionIndex) / 15) * 100}%` }}
                  />
                </div>

                <div className="space-y-4 text-center mt-2">
                  <div className="flex justify-between items-center px-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-full">
                    <span>{currentGameQuestionType === 'def_to_account'
                      ? (isEn ? 'IDENTIFY THE CORRESPONDING ACCOUNT' : 'ADIVINA LA CUENTA CORRESPONDIENTE')
                      : (isEn ? 'IDENTIFY WHAT IS RECORDED IN THIS ACCOUNT' : '¿QUÉ HECHO REGISTRA ESTA CUENTA?')}</span>
                    <span className="font-mono">{isEn ? `Q: ${gameQuestionIndex}/15` : `PREG: ${gameQuestionIndex}/15`}</span>
                  </div>
                  
                  <div className="p-6 md:p-8 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-center justify-center min-h-[140px] shadow-inner">
                    {currentGameQuestionType === 'def_to_account' ? (
                      <p className="text-lg md:text-xl font-black text-zinc-900 leading-normal tracking-tight balance-title">
                        "{currentQuestionText}"
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-5xl font-black text-emerald-600 font-mono tracking-tight block">
                          {currentQuestion.code}
                        </span>
                        <span className="text-lg font-extrabold text-zinc-700 tracking-tight block uppercase">
                          {isEn ? (ACCOUNT_MAPPING_EN[currentQuestion.code] || currentQuestion.name) : currentQuestion.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Multiple choices options list */}
                <div className="grid grid-cols-1 gap-3.5 pt-2">
                  {gameOptions.map((opt, idx) => {
                    const isSelected = gameSelectedOption === opt;
                    const isCorrect = opt === gameCorrectOption;
                    const showFeedback = gameSelectedOption !== null;
                    const optionLetter = ['A', 'B', 'C', 'D'][idx];

                    let btnStyles = "border-zinc-200 hover:border-emerald-200 hover:bg-emerald-50/20 bg-white text-zinc-800 hover:translate-y-[-1px] active:translate-y-[1px]";
                    if (showFeedback) {
                      if (isCorrect) {
                        btnStyles = "border-emerald-500 bg-emerald-50 text-emerald-950 scale-[1.01] shadow-md shadow-emerald-100";
                      } else if (isSelected) {
                        btnStyles = "border-red-500 bg-red-50 text-red-950 animate-shake";
                      } else {
                        btnStyles = "border-zinc-100 bg-zinc-50/50 text-zinc-400 opacity-60 pointer-events-none";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          playSynthSound('click');
                          submitAnswer(opt);
                        }}
                        disabled={showFeedback}
                        className={`p-5 rounded-2xl border-2 font-bold text-sm md:text-base text-left flex items-start justify-between transition-all gap-3 cursor-pointer ${btnStyles}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`font-mono text-xs font-black px-2.5 py-1 rounded-lg shrink-0 mt-0.5 ${
                            showFeedback && isCorrect 
                              ? 'bg-emerald-600 text-white' 
                              : showFeedback && isSelected && !isCorrect 
                                ? 'bg-red-600 text-white' 
                                : 'bg-zinc-100 text-zinc-500'
                          }`}>
                            {optionLetter}
                          </span>
                          <span className="leading-tight pt-0.5">{opt}</span>
                        </div>

                        {showFeedback && isCorrect && (
                          <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center shrink-0 shadow">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                        {showFeedback && isSelected && !isCorrect && (
                          <div className="w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shrink-0 shadow">
                            <X className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {gameStatus === 'gameover' && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="max-w-2xl mx-auto w-full"
            >
              <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-zinc-100 text-center space-y-8 relative overflow-hidden">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <Trophy className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-emerald-600 tracking-widest block bg-emerald-50/80 px-4 py-1 rounded-full w-max mx-auto border border-emerald-100">
                    {getPlayerRank(gameScore, isEn)}
                  </span>
                  <h3 className="text-3xl font-black text-zinc-950 uppercase tracking-tight">
                    {isEn ? 'Match Completed!' : '¡Partida Completada!'}
                  </h3>
                  <p className="text-zinc-500 font-medium text-sm">
                    {isEn ? 'Review your results and claimed accounting experience' : 'Verifica tus resultados y reclama tus puntos acumulados'}
                  </p>
                </div>

                {/* XP Claimed Box */}
                <div className="p-6 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white rounded-3xl space-y-1 shadow-lg shadow-emerald-100/80">
                  <div className="text-[9px] font-black tracking-widest text-emerald-100 uppercase">
                    {isEn ? "EXPERIENCE POINTS CLAIMED!" : "¡EXPERIENCIA RECLAMADA PARPADEANDO!"}
                  </div>
                  <div className="text-4xl font-extrabold flex items-center justify-center gap-2">
                    🌟 +{xpEarnedThisMatch} XP
                  </div>
                  <p className="text-[10px] text-emerald-50 font-bold uppercase tracking-wider">
                    {isEn ? 'Successfully committed to your student profile!' : '¡Inscritos con éxito en tu ficha de alumno!'}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-100 text-center shadow-sm">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                      {isEn ? 'Points Achieved' : 'Puntos Conseguidos'}
                    </span>
                    <span className="text-3xl font-black text-emerald-600">{gameScore}</span>
                  </div>
                  <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-100 text-center shadow-sm">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                      {isEn ? 'Max Streak' : 'Racha Máxima'}
                    </span>
                    <span className="text-3xl font-black text-orange-600">🔥 {gameMaxStreak}</span>
                  </div>
                </div>
                
                {!isScoreSaved && gameMode === 'time_attack' ? (
                  <div className="space-y-4">
                    <div className="text-left space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-4">
                        {isEn ? 'Your Name' : 'Tu Nombre'}
                      </label>
                      <input 
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder={isEn ? "Write your name..." : "Escribe tu nombre..."}
                        className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-emerald-500 outline-none font-bold text-zinc-700 transition-all text-sm"
                        autoFocus
                      />
                    </div>
                    <button 
                      onClick={() => {
                        playSynthSound('click');
                        saveScore(gameScore, playerName);
                      }}
                      className="w-full py-4.5 bg-zinc-900 text-white hover:bg-black rounded-2xl font-black text-base shadow-xl transition-all active:scale-95 text-center uppercase tracking-wider cursor-pointer"
                    >
                      {isEn ? 'SAVE RECORD' : 'GUARDAR RECORD'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {gameMode === 'time_attack' && (
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-2 text-emerald-700 font-bold text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        {isEn ? 'Score successfully recorded!' : '¡Puntuación guardada con éxito!'}
                      </div>
                    )}

                    {missedQuestions.length > 0 && (
                      <div className="space-y-4 text-left border-t border-zinc-100 pt-6">
                        <div className="flex items-center gap-2 px-1">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest">
                            {isEn ? 'Review Mistakes' : 'Repaso de Errores cometidos'}
                          </h4>
                        </div>
                        <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                          {missedQuestions.map((q, i) => (
                            <div key={i} className="p-4.5 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3.5">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-md">
                                  {q.type}
                                </span>
                                <span className="text-[10px] font-bold text-zinc-400 font-mono">#{q.code}</span>
                              </div>
                              <p className="text-sm font-extrabold text-zinc-800 leading-normal">{q.question}</p>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-100/60">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black text-red-500 uppercase tracking-widest block">
                                    {isEn ? 'Your Choice' : 'Tu Selección'}
                                  </span>
                                  <span className="text-xs font-bold text-red-600 leading-normal">{q.userAnswer}</span>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block">
                                    {isEn ? 'Correct Match' : 'Cuentas Correctas'}
                                  </span>
                                  <span className="text-xs font-black text-emerald-700 leading-normal">{q.correctAnswer}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => {
                        playSynthSound('click');
                        setGameStatus('selection');
                      }}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-md hover:bg-emerald-700 transition-all active:scale-95 text-center uppercase tracking-widest cursor-pointer"
                    >
                      {isEn ? 'PLAY ANOTHER ROUND' : 'JUGAR OTRA PARTIDA'}
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
    const isEn = language === 'en';
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans relative">
        {/* Floating Language Switcher */}
        <div className="absolute top-6 right-6">
          <button 
            onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md border border-zinc-200"
            title={isEn ? "Cambiar a Español" : "Switch to English"}
          >
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>{isEn ? "Español" : "English"}</span>
          </button>
        </div>

        <div className="max-w-4xl w-full space-y-12">
          <div className="text-center space-y-4">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[11px] font-bold uppercase tracking-[0.2em] rounded-full mb-2"
            >
              {isEn ? 'Learning Platform' : 'Plataforma de Aprendizaje'}
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black text-zinc-900 tracking-tight"
            >
              {isEn ? (
                <>Accounting <span className="text-emerald-600">Tutor</span></>
              ) : (
                <>Tutor de <span className="text-emerald-600">Contabilidad</span></>
              )}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-zinc-500 font-medium max-w-2xl mx-auto"
            >
              {isEn 
                ? 'Master the accounting cycle with the interactive tool designed for students and professionals by Daniel Arnaiz Boluda.'
                : 'Domina el ciclo contable con la herramienta interactiva diseñada para estudiantes y profesionales por Daniel Arnaiz Boluda.'}
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
              <h3 className="text-3xl font-bold text-zinc-900 mb-4">
                {isEn ? 'Accounting' : 'Contabilizar'}
              </h3>
              <p className="text-zinc-500 leading-relaxed text-lg">
                {isEn 
                  ? 'Practice accounting entries, manage the journal ledger and inspect the Balance Sheet in real time with AI.'
                  : 'Practica asientos contables, gestiona el libro diario y visualiza el balance de situación en tiempo real con ayuda de IA.'}
              </p>
              <div className="mt-10 flex items-center text-emerald-600 font-bold text-sm uppercase tracking-widest">
                {isEn ? 'Start now' : 'Empezar ahora'} <ChevronRight className="ml-2 w-5 h-5" />
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
                {isEn ? 'New' : 'Nuevo'}
              </div>
              <h3 className="text-3xl font-bold text-zinc-900 mb-4">
                {isEn ? 'Review accounts' : 'Repasar cuentas'}
              </h3>
              <p className="text-zinc-500 leading-relaxed text-lg">
                {isEn 
                  ? 'Learn and memorize the General Chart of Accounts (PGC) with interactive templates, definitions and classification tasks.'
                  : 'Aprende y memoriza el Plan General Contable con ejercicios interactivos de clasificación y definición de cuentas.'}
              </p>
              <div className="mt-10 flex items-center text-emerald-600 font-bold text-sm uppercase tracking-widest">
                {isEn ? 'Play now' : 'Jugar ahora'} <ChevronRight className="ml-2 w-5 h-5" />
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
            title={language === 'en' ? 'Back to main menu' : 'Volver al menú principal'}
          >
            <Calculator className="text-white w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">ContaIA ─ Daniel Arnaiz Boluda</h1>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {language === 'en' ? 'Dynamic Balance Sheet & Socratic Tutoring' : 'Balance Dinámico & Tutoría Socrática'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {isPizarraMode && (
              <button 
                onClick={() => {
                  const newState = !showPizarraBalance;
                  setShowPizarraBalance(newState);
                  if (!newState) {
                    setPizarraColumns(1);
                  } else {
                    setPizarraColumns(2);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors border ${
                  showPizarraBalance 
                    ? 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100' 
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                }`}
                title={showPizarraBalance 
                  ? (language === 'en' ? "Hide Balance Sheet" : "Ocultar Balance") 
                  : (language === 'en' ? "Show Balance Sheet" : "Mostrar Balance")}
              >
                <Layout className="w-4 h-4" />
                <span className="hidden md:inline">
                  {language === 'en' ? 'Balance Sheet' : 'Balance'}
                </span>
              </button>
            )}
            {isPizarraMode && !showChatAssistant && (
              <button 
                onClick={() => setShowChatAssistant(true)}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-lg shadow-emerald-200"
                title={language === 'en' ? 'Accounting AI Professor' : 'Profesor IA de Contabilidad'}
              >
                <HelpCircle className="w-4 h-4" />
                <span className="hidden md:inline">
                  {language === 'en' ? 'AI Professor' : 'Profesor IA'}
                </span>
              </button>
            )}
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-red-100"
              title={language === 'en' ? 'Reset session' : 'Reiniciar sesión'}
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden md:inline">
                {language === 'en' ? 'Reset' : 'Reiniciar'}
              </span>
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-200 hidden sm:block" />

          {/* Language toggle inside app header */}
          <button 
            onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-zinc-200"
            title={language === 'es' ? "Switch to English" : "Cambiar a Español"}
          >
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>{language === 'es' ? "EN" : "ES"}</span>
          </button>

          <button 
            onClick={() => setIsCustomizing(true)}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">
              {language === 'en' ? 'Customize' : 'Personalizar'}
            </span>
          </button>
          
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
        {/* Pizarra Mode View (Default & Only View) */}
        <div 
          ref={pizarraContainerRef}
          className={`w-full flex flex-col ${pizarraColumns === 2 ? 'lg:flex-row' : ''} gap-0 pb-12 items-start relative`}
        >
            {/* Balance Column */}
            {showPizarraBalance && (
              <div 
                className="flex-shrink-0"
                style={{ width: pizarraColumns === 2 ? `${pizarraSplit}%` : '100%' }}
              >
                <div className={pizarraColumns === 2 ? "mr-4" : ""}>
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-emerald-600" /> {language === 'en' ? 'Updated Balance Sheet' : 'Balance actualizado'}
                        </span>
                        <div className="flex items-center bg-zinc-100 rounded-lg px-1 py-0.5">
                          <button 
                            onClick={() => setBalanceFontScale(prev => Math.max(70, prev - 10))}
                            className="p-1 hover:bg-zinc-200 text-zinc-600 rounded transition-colors"
                            title={language === 'en' ? 'Decrease font size' : 'Disminuir letra'}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] font-bold text-zinc-500 min-w-[2.5rem] text-center">{balanceFontScale}%</span>
                          <button 
                            onClick={() => setBalanceFontScale(prev => Math.min(200, prev + 10))}
                            className="p-1 hover:bg-zinc-200 text-zinc-600 rounded transition-colors"
                            title={language === 'en' ? 'Increase font size' : 'Aumentar letra'}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${Math.abs(totalAssets - totalLiabilities) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {Math.abs(totalAssets - totalLiabilities) < 0.01 
                          ? (language === 'en' ? 'Balanced' : 'Cuadrado') 
                          : (language === 'en' ? 'Unbalanced' : 'Descuadrado')}
                      </div>
                    </div>
                    <div className="p-6 pizarra-balance-container">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Assets side */}
                        <div className="space-y-4">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">
                            {language === 'en' ? 'Assets' : 'Activo'}
                          </h3>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <h4 id="section-assets-noncurrent-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">
                                {language === 'en' ? 'Non-Current' : 'No Corriente'}
                              </h4>
                              <div className="space-y-0.5">
                                {[...currentBalance.assets.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                  <BalanceRow key={item.name} item={item} language={language} />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <h4 id="section-assets-current-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">
                                {language === 'en' ? 'Current' : 'Corriente'}
                              </h4>
                              <div className="space-y-0.5">
                                {[...currentBalance.assets.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                  <BalanceRow key={item.name} item={item} language={language} />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                            <span className="text-[11px] font-bold text-zinc-500 uppercase">
                              {language === 'en' ? 'Total Assets' : 'Total Activo'}
                            </span>
                            <span className="text-lg font-black text-emerald-600"><AnimatedNumber value={totalAssets} /></span>
                          </div>
                        </div>

                        {/* Liabilities & Equity side */}
                        <div className="space-y-4">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">
                            {language === 'en' ? 'Equity + Liabilities' : 'Patrimonio Neto + Pasivo'}
                          </h3>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <h4 id="section-equity-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">
                                {language === 'en' ? 'Equity' : 'Patrimonio Neto'}
                              </h4>
                              <div className="space-y-0.5">
                                {[...currentBalance.liabilitiesAndEquity.equity].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                  <BalanceRow key={item.name} item={item} language={language} />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <h4 id="section-liabilities-noncurrent-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">
                                {language === 'en' ? 'Non-Current Liabilities' : 'Pasivo No Corriente'}
                              </h4>
                              <div className="space-y-0.5">
                                {[...currentBalance.liabilitiesAndEquity.nonCurrent].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                  <BalanceRow key={item.name} item={item} language={language} />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <h4 id="section-liabilities-current-pizarra" className="text-[10px] font-bold text-zinc-400 uppercase">
                                {language === 'en' ? 'Current Liabilities' : 'Pasivo Corriente'}
                              </h4>
                              <div className="space-y-0.5">
                                {[...currentBalance.liabilitiesAndEquity.current].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((item) => (
                                  <BalanceRow key={item.name} item={item} language={language} />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-zinc-200 flex justify-between items-center">
                            <span className="text-[11px] font-bold text-zinc-500 uppercase">
                              {language === 'en' ? 'Total E + L' : 'Total PN + P'}
                            </span>
                            <span className="text-lg font-black text-emerald-600"><AnimatedNumber value={totalLiabilities} /></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resizable Divider */}
            {pizarraColumns === 2 && showPizarraBalance && (
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
              <div className={pizarraColumns === 2 && showPizarraBalance ? "ml-4" : "mt-0"}>
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-zinc-100 flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-emerald-500" /> {language === 'en' ? 'Journal Book' : 'Libro Diario'}
                      </span>
                      <div className="flex items-center bg-zinc-800 rounded-lg px-1 py-0.5 border border-zinc-700">
                        <button 
                          onClick={() => setJournalFontScale(prev => Math.max(70, prev - 10))}
                          className="p-1 hover:bg-zinc-700 text-zinc-400 rounded transition-colors"
                          title={language === 'en' ? "Decrease font size" : "Disminuir letra"}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-bold text-zinc-500 min-w-[2.5rem] text-center">{journalFontScale}%</span>
                        <button 
                          onClick={() => setJournalFontScale(prev => Math.min(200, prev + 10))}
                          className="p-1 hover:bg-zinc-700 text-zinc-400 rounded transition-colors"
                          title={language === 'en' ? "Increase font size" : "Aumentar letra"}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                      <div className="flex gap-3 items-center">
                        <button 
                          onClick={() => setIsJournalFullscreen(true)}
                          className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400"
                          title={language === 'en' ? "Fullscreen" : "Pantalla Completa"}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={clearDraft}
                          className="text-[13px] font-bold uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {language === 'en' ? 'Clear Draft' : 'Limpiar Borrador'}
                        </button>
                        <button 
                          onClick={() => setCurrentJournal([])}
                          className="text-[13px] font-bold uppercase text-red-500 hover:text-red-400 transition-colors"
                        >
                          {language === 'en' ? 'Clear Journal' : 'Borrar Diario'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-6 pizarra-journal-container flex-1 overflow-y-auto">
                    {/* Entry Form */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 px-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {language === 'en' ? 'Entry Date' : 'Fecha del Asiento'}
                          </label>
                          <input 
                            type="text"
                            placeholder={language === 'en' ? "dd/mm/yy" : "dd/mm/aa"}
                            value={draftDate}
                            onChange={(e) => setDraftDate(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500 w-32"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-3 text-[12px] font-bold text-zinc-500 uppercase tracking-widest px-2">
                        <div className="col-span-2">
                          {language === 'en' ? 'Account No.' : 'Nº Cuenta'}
                        </div>
                        <div className="col-span-4">
                          {language === 'en' ? 'Concept' : 'Concepto'}
                        </div>
                        <div className="col-span-2 text-right">
                          {language === 'en' ? 'Debit' : 'Debe'}
                        </div>
                        <div className="col-span-2 text-right">
                          {language === 'en' ? 'Credit' : 'Haber'}
                        </div>
                        <div className="col-span-2"></div>
                      </div>
                      
                      <div className="space-y-2">
                        {draft.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-2">
                              <input 
                                type="text"
                                placeholder={language === 'en' ? "Code" : "Código"}
                                value={row.code}
                                onChange={(e) => updateDraft(idx, 'code', e.target.value)}
                                className="w-full bg-zinc-800 border-zinc-700 text-zinc-200 text-[14px] rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="col-span-4">
                              <input 
                                type="text"
                                placeholder={language === 'en' ? "Account" : "Cuenta"}
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
                                title={row.reflected 
                                  ? (language === 'en' ? 'Reflected' : 'Reflejado') 
                                  : (language === 'en' ? 'Reflect' : 'Reflejar')}
                              >
                                <RefreshCw className={`w-3 h-3 ${row.reflected ? 'animate-pulse' : ''}`} />
                              </button>
                              {draft.length > 1 && (
                                <button 
                                  onClick={() => setDraft(draft.filter((_, i) => i !== idx))}
                                  className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                        </button>)}</div></div>))}</div><div className="flex justify-between items-center pt-4"><button onClick={addDraftRow} className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> {language === 'en' ? 'Add line' : 'Añadir línea'}
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
                            {language === 'en' ? 'Post Entry' : 'Contabilizar Asiento'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Historical Journal */}
                    <div className="pt-8 border-t border-zinc-800 space-y-4">
                      <h4 className="text-[13px] font-bold text-zinc-500 uppercase tracking-widest">
                        {language === 'en' ? 'Registered Entries' : 'Asientos Realizados'}
                      </h4>
                      <div className="space-y-4 font-mono">
                        {currentJournal.map((asiento, aIdx) => (
                          <div key={aIdx} className={aIdx > 0 ? "border-t border-zinc-800 pt-4" : ""}>
                            <div className="mb-2 px-2 flex flex-col">
                              <span className="text-[11px] text-zinc-500">
                                {language === 'en' ? `Entry #${aIdx + 1}` : `Asiento #${aIdx + 1}`}
                              </span>
                              <span className="text-[11px] font-bold text-emerald-500/80">{asiento[0]?.date || 'xx/xx/xx'}</span>
                            </div>
                            {asiento.map((row, idx) => {
                              const displayName = row.code 
                                ? (language === 'en' ? (ACCOUNT_MAPPING_EN[row.code] || row.account) : (ACCOUNT_MAPPING[row.code] || row.account)) 
                                : row.account;
                              return (
                                <div key={idx} className="grid grid-cols-12 gap-4 text-[14px] py-1 px-2 hover:bg-zinc-800/50 rounded transition-colors">
                                  <div className={`col-span-6 ${row.haber > 0 ? 'pl-4 text-zinc-400' : 'text-emerald-400 font-bold'}`}>
                                    {row.haber > 0 ? (language === 'en' ? 'to ' : 'a ') : ''}
                                    {row.code && <span className="text-[12px] opacity-80 mr-4 font-black text-emerald-500">{row.code}</span>}
                                    {displayName}
                                  </div>
                                  <div className="col-span-3 text-right text-zinc-300">
                                    {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                                  </div>
                                  <div className="col-span-3 text-right text-zinc-300">
                                    {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {currentJournal.length === 0 && (
                          <p className="text-[13px] text-zinc-600 italic text-center py-4">
                            {language === 'en' ? 'No entries registered yet' : 'No hay asientos registrados aún'}
                          </p>
                        )}
                      </div>

                      {/* Pizarra Digital Button at the end of Journal */}
                      <div className="pt-4 flex justify-center">
                        <button 
                          onClick={() => setIsDigitalWhiteboardOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-900/20 group"
                          title={language === 'en' ? 'Activate Digital Whiteboard' : 'Activar Pizarra Digital'}
                        >
                          <Monitor className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-bold uppercase tracking-wider">
                            {language === 'en' ? 'Digital Whiteboard' : 'Pizarra Digital'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  <h2 className="text-2xl font-bold text-white">
                    {language === 'en' ? 'Journal Book ─ Full View' : 'Libro Diario ─ Vista Completa'}
                  </h2>
                  <p className="text-sm text-zinc-500 uppercase tracking-widest">
                    {language === 'en' ? 'Entry History & Recording' : 'Historial de Asientos y Registro'}
                  </p>
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
                    <div className="col-span-6">
                      {language === 'en' ? 'Account / Concept' : 'Cuenta / Concepto'}
                    </div>
                    <div className="col-span-3 text-right">
                      {language === 'en' ? 'Debit' : 'Debe'}
                    </div>
                    <div className="col-span-3 text-right">
                      {language === 'en' ? 'Credit' : 'Haber'}
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="space-y-8 font-mono">
                    {currentJournal.map((asiento, aIdx) => (
                      <div key={aIdx} className={aIdx > 0 ? "border-t border-white pt-8" : ""}>
                        <div className="mb-4 flex items-center gap-3">
                          <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                            {language === 'en' ? `Entry #${aIdx + 1}` : `Asiento #${aIdx + 1}`}
                          </span>
                        </div>
                        {asiento.map((row, idx) => {
                          const displayName = row.code 
                            ? (language === 'en' ? (ACCOUNT_MAPPING_EN[row.code] || row.account) : (ACCOUNT_MAPPING[row.code] || row.account)) 
                            : row.account;
                          return (
                            <div key={idx} className="grid grid-cols-12 gap-6 text-[18px] py-2 px-4 hover:bg-zinc-800/50 rounded-xl transition-colors">
                              <div className={`col-span-6 ${row.haber > 0 ? 'pl-8 text-zinc-400' : 'text-emerald-400 font-bold'}`}>
                                {row.haber > 0 ? (language === 'en' ? 'to ' : 'a ') : ''}
                                {row.code && <span className="text-[12px] opacity-50 mr-2">{row.code}</span>}
                                {displayName}
                              </div>
                              <div className="col-span-3 text-right text-zinc-200">
                                {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                              </div>
                              <div className="col-span-3 text-right text-zinc-200">
                                {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {currentJournal.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-600 italic">
                        <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-xl">
                          {language === 'en' ? 'No entries registered yet' : 'No hay asientos registrados aún'}
                        </p>
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
              language={language}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPizarraMode && showChatAssistant && (
          <ChatAssistant onClose={() => setShowChatAssistant(false)} language={language} />
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
