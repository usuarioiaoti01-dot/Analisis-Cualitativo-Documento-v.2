/**
 * Identidad de quien opera el sistema.
 *
 * El sistema todavía no tiene autenticación: la etapa 7 exige registrar quién
 * valida cada hallazgo y cada evaluación, y ese dato tiene que salir de algún
 * lado. Se concentra aquí, en un único punto, para que incorporar el inicio de
 * sesión sea sustituir este módulo y nada más.
 *
 * Mientras tanto la trazabilidad es nominal, no verificada: registra un nombre,
 * no prueba quién lo escribió.
 */

export interface Usuario {
  nombre: string;
  rol: string;
  iniciales: string;
}

export const USUARIO_ACTUAL: Usuario = {
  nombre: 'Martín Montoya',
  rol: 'Administrador',
  iniciales: 'MN',
};
