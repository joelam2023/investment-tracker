# Investment Tracker — Seguimiento privado de carteras en Obsidian

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | Español | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**Tu cartera. Tu bóveda. Cifrada.**

Investment Tracker es un gestor de carteras privado y local para Obsidian. Registra flujos de efectivo, valoraciones, rentabilidades y el rendimiento de referencia mientras tus datos de inversión cifrados permanecen en tu bóveda, sin cuentas, telemetría ni un servidor operado por el desarrollador.

Funciona a nivel de cuenta, por lo que puedes calcular el rendimiento de tus inversiones sin mantener un historial de operaciones por posición.

## Datos clave

| Tema | Cómo funciona Investment Tracker |
| --- | --- |
| Registros de inversión | Se cifran y almacenan dentro de la bóveda de Obsidian del usuario |
| Servidor operado por el desarrollador | Ninguno |
| Cuenta o inicio de sesión | No son necesarios |
| Telemetría y análisis | Ninguno |
| Cifrado | AES-256-GCM; la clave del registro está protegida mediante PBKDF2-SHA256 y una clave de recuperación independiente |
| Acceso opcional a la red | El modo de referencia automático solicita a FRED datos públicos del índice de referencia y de tipos de cambio |
| Sincronización de la bóveda | Un servicio elegido por el usuario, como Obsidian Sync o iCloud, puede sincronizar el registro cifrado |
| Exportaciones | Las exportaciones JSON y CSV creadas por el usuario son archivos de texto sin cifrar |

## Funciones

- Varias cuentas de inversión en USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR o BRL.
- Elige la moneda de cada cuenta al crearla, edita después su nombre o índice de referencia y archívala o restáurala sin borrar el historial cifrado.
- Contabilidad inmutable basada en eventos para aportaciones, retiradas y valoraciones.
- XIRR, beneficio acumulado, rentabilidades anuales y rentabilidades mensuales según Modified Dietz.
- Comparación con el S&P 500 Price Index utilizando los mismos flujos de efectivo.
- Conversión de la referencia de FRED según la moneda, con comprobaciones explícitas del sentido de cotización.
- Bloqueo con contraseña, clave de recuperación independiente, valores financieros ocultables y bloqueo automático configurable.
- Eventos JSON cifrados almacenados dentro de la bóveda del usuario.
- Exportación local explícita a JSON y CSV; el flujo de ajustes exige volver a autenticarse con la contraseña.
- Selección automática del idioma de la interfaz, con elección manual e inglés como idioma de reserva.
- Inglés, chino simplificado, chino tradicional, japonés, coreano, español, alemán, francés y portugués de Brasil.

## Recomendado para

- Inversores preocupados por la privacidad que quieran conservar los registros de su cartera dentro de su propia bóveda de Obsidian.
- Personas que registren manualmente aportaciones, retiradas y valoraciones a nivel de cuenta.
- Inversores que necesiten XIRR, rendimiento mensual y anual, y una comparación con el S&P 500.
- Usuarios que prefieran un flujo de trabajo local sin crear otra cuenta financiera.

## No está diseñado para

- Sincronizar cuentas de bróker.
- Gestionar posiciones en tiempo real, cotizaciones, lotes fiscales ni operaciones automatizadas.
- Sustituir un extracto del bróker, un documento fiscal o el asesoramiento de un profesional financiero.
- Proteger una bóveda desbloqueada frente a un dispositivo comprometido u otro complemento malicioso.

## Instalación y actualizaciones

Instala **Investment Tracker** desde **Obsidian → Ajustes → Complementos de la comunidad → Explorar**. Busca «Investment Tracker», selecciona el complemento y pulsa **Instalar** y, después, **Activar**.

Las actualizaciones se distribuyen mediante el mecanismo de actualización de los complementos de la comunidad de Obsidian.

Para instalarlo manualmente o hacer pruebas, coloca `main.js`, `manifest.json` y `styles.css` en:

```text
<Bóveda>/.obsidian/plugins/investment-tracker/
```

## Uso básico

1. Abre Investment Tracker desde la barra lateral.
2. Establece una contraseña y guarda la clave de recuperación generada fuera de la bóveda.
3. Crea una cuenta y registra su valoración inicial.
4. Registra las aportaciones y retiradas externas, así como las valoraciones totales actualizadas de la cuenta.
5. Usa el botón del ojo para mostrar u ocultar los valores financieros.
6. Consulta las rentabilidades mensuales y anuales y compáralas con el índice de referencia seleccionado.
7. Elige las reglas de bloqueo automático en **Ajustes → Investment Tracker → Privacidad y cifrado**.

Cambiar el idioma de la interfaz nunca modifica la moneda de una cuenta existente. En una instalación nueva, el complemento solo utiliza la configuración regional para sugerir una moneda inicial; el usuario puede cambiarla antes de crear una cuenta.

## Privacidad y seguridad

Investment Tracker no tiene nube operada por el desarrollador, sistema de cuentas, telemetría, análisis, publicidad ni mecanismo de subida automática. Los nombres de cuenta, fechas, importes, notas y datos de eventos se cifran y almacenan en la bóveda de Obsidian del usuario. Las instalaciones nuevas utilizan la carpeta `Investment Tracker Data`; las rutas de datos existentes que sean seguras se conservan durante las actualizaciones.

Los datos de eventos se cifran con AES-256-GCM. La clave del registro se encapsula mediante una clave PBKDF2-SHA256 derivada de la contraseña y una clave de recuperación independiente. Ni la contraseña ni la clave del registro sin encapsular se escriben en los ajustes del complemento.

El bloqueo automático tiene dos reglas independientes: bloquear inmediatamente al salir de Investment Tracker o cuando Obsidian pierde el foco, y bloquear después de 1, 5, 15 o 30 minutos sin actividad en Investment Tracker. Al menos una regla permanece activada. Si el bloqueo inmediato al salir está desactivado, salir seguirá ocultando los valores financieros, contrayendo el historial ampliado y cerrando los cuadros de diálogo sensibles. La regla de inactividad o un bloqueo manual determina cuándo se borra de la memoria la clave del registro.

Una clave de recuperación recién generada se oculta al salir y solo vuelve a mostrarse después de desbloquear el registro. Guarda la clave de recuperación fuera de la bóveda y utiliza una contraseña segura y exclusiva.

El cifrado protege los archivos almacenados del registro frente a una exposición accidental. No puede proteger los datos mientras el complemento está desbloqueado, frente a un dispositivo comprometido, capturas de pantalla o exposición del portapapeles, ni frente a otro complemento malicioso con acceso a la misma bóveda.

### Sincronización y exportaciones

Investment Tracker no opera ningún servicio de sincronización. Si el usuario activa Obsidian Sync, iCloud u otro servicio de sincronización de la bóveda, ese servicio elegido por el usuario puede sincronizar los archivos cifrados del registro entre dispositivos.

Las exportaciones JSON y CSV son archivos de texto sin cifrar que solo se crean cuando el usuario realiza una exportación explícita. Trátalos como registros financieros sensibles y guárdalos o elimínalos de forma adecuada.

Consulta la [Política de privacidad](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md) y la [Política de seguridad](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md) completas.

## Información sobre la red

El registro básico de datos y los cálculos de rentabilidad no requieren un servicio operado por el desarrollador. El modo de referencia automático envía solicitudes HTTPS GET al servicio Federal Reserve Economic Data en `fred.stlouisfed.org` para obtener datos del S&P 500 y de conversión de divisas.

Estas solicitudes solo contienen identificadores de series públicas, las monedas seleccionadas necesarias para elegir una serie de tipos de cambio y los intervalos de fechas. No incluyen nombres de cuenta, saldos, importes de flujos de efectivo, valoraciones, notas, contraseñas, claves de recuperación ni el contenido del registro.

Los usuarios pueden seleccionar el modo de referencia manual para evitar las solicitudes automáticas a FRED. Las actualizaciones automáticas del índice de referencia necesitan conexión a internet. La serie del S&P 500 utilizada por el complemento es un índice de precios y no incluye dividendos.

## Preguntas frecuentes

### ¿Investment Tracker sube los datos de mi cartera?

No se envía ningún registro de la cartera a un servidor operado por el desarrollador. El complemento no tiene sistema de cuentas del desarrollador, telemetría, análisis ni subida automática de la cartera. El modo de referencia automático realiza las solicitudes limitadas a FRED descritas en [Información sobre la red](#información-sobre-la-red).

### ¿Dónde se almacenan mis datos de inversión?

El registro cifrado se almacena dentro de la bóveda de Obsidian del usuario. Las instalaciones nuevas utilizan `Investment Tracker Data`. Si la bóveda se sincroniza mediante un servicio elegido por el usuario, ese servicio también puede almacenar o transferir el registro cifrado.

### ¿Mis datos de inversión están cifrados?

Los datos de eventos almacenados se cifran con AES-256-GCM. Una clave PBKDF2-SHA256 derivada de la contraseña y una clave de recuperación independiente protegen la clave del registro. Los datos son visibles mientras el complemento está desbloqueado, y las exportaciones JSON o CSV creadas por el usuario no están cifradas.

### ¿Puedo usar Investment Tracker sin conexión?

Los registros locales y los cálculos de rentabilidad pueden utilizarse sin un servicio operado por el desarrollador. Las actualizaciones automáticas de la referencia y de divisas de FRED necesitan conexión a internet; el modo de referencia manual evita esas solicitudes.

### ¿Se conecta a mi cuenta de bróker?

No. Investment Tracker no se conecta a cuentas de bróker. Los usuarios registran manualmente las aportaciones y retiradas externas y las valoraciones totales de la cuenta.

### ¿Registra posiciones u operaciones individuales?

No es necesario mantener un historial de operaciones por posición. El complemento está diseñado para flujos de efectivo y valoraciones a nivel de cuenta, no para posiciones en tiempo real ni contabilidad por lotes fiscales.

### ¿Qué información se envía a FRED?

Las solicitudes automáticas del índice de referencia solo incluyen identificadores de series públicas, las monedas seleccionadas necesarias para elegir la serie de tipos de cambio y los intervalos de fechas. No incluyen registros de cartera ni credenciales.

### ¿Qué ocurre si pierdo mi contraseña?

Utiliza la clave de recuperación guardada por separado para recuperar el acceso mediante el flujo de recuperación del complemento. Si pierdes tanto la contraseña como la clave de recuperación, el registro cifrado puede quedar inaccesible.

### ¿Las exportaciones JSON y CSV están cifradas?

No. Las exportaciones JSON y CSV son archivos de texto sin cifrar y deben tratarse como registros financieros sensibles.

## Ayuda y comentarios

Abre **Ajustes → Investment Tracker → Ayuda y comentarios** para informar de un error, proponer una función o copiar información de diagnóstico no sensible. Los informes pueden redactarse en cualquier idioma.

Los enlaces de comentarios solo abren GitHub después de que el usuario pulse un botón. El complemento nunca crea automáticamente un informe ni envía al desarrollador el registro, nombres de cuenta, saldos, transacciones, contraseñas, claves de recuperación, nombres o rutas de la bóveda ni información de diagnóstico. Revisa los datos de diagnóstico copiados y oculta la información sensible de las capturas de pantalla antes de enviarlas.

Informa de vulnerabilidades de seguridad o privacidad mediante los [informes privados de vulnerabilidades de GitHub](https://github.com/joelam2023/investment-tracker/security/advisories/new), no mediante una incidencia pública.

## Desarrollo

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

Las traducciones utilizan los textos originales en inglés como idioma de reserva. Las solicitudes de cambios que modifiquen textos visibles para el usuario deben actualizar todos los idiomas y conservar sin cambios los marcadores de interpolación.

Las etiquetas de versión deben coincidir exactamente con la versión semántica de `manifest.json`, sin el prefijo `v`. El flujo de publicación crea un borrador de versión de GitHub que contiene únicamente `main.js`, `manifest.json` y `styles.css` para revisarlo manualmente antes de publicarlo.

Las instrucciones para responsables del mantenimiento están en la [Guía de publicación](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md) completa.

## Aviso financiero

Este complemento es una herramienta de registro y cálculo; no ofrece asesoramiento financiero, fiscal, jurídico ni de inversión. Verifica de forma independiente los cálculos importantes antes de tomar decisiones.

## Licencia

[Licencia MIT](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)
