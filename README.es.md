# NovaAI Code

Español · [English](README.md)

NovaAI Code es un asistente de programación open source, centrado en IA local y diseñado para Windows. Permite abrir una carpeta real, explorar y editar sus archivos y conectarse con proveedores locales o externos sin crear una cuenta de NovaAI Code.

> Beta temprana: utiliza Git o una copia de seguridad para proyectos importantes. Las funciones de agente pueden modificar archivos y ejecutar un conjunto restringido de comandos del proyecto.

## ¿Por qué NovaAI Code?

- IA local primero: Ollama y LM Studio son proveedores de primera clase.
- Errores comprensibles: pruebas de conexión, timeouts, cancelación y diagnósticos accionables.
- Chat por proyecto: las conversaciones se almacenan y mantienen aisladas por carpeta.
- Cambios revisables: las operaciones se limitan al proyecto seleccionado.
- Sin cuenta de NovaAI: las credenciales permanecen bajo el control del usuario.

## Funciones actuales

- Abrir y recordar varios proyectos.
- Explorador que respeta `.gitignore` y excluye builds y cachés habituales.
- Editor con pestañas, resaltado y guardado atómico.
- Crear, renombrar, editar y eliminar archivos o carpetas.
- Historial por proyecto, chats fijados, archivado, duplicado y búsqueda.
- Adjuntar archivos e imágenes y pegar imágenes con Ctrl+V.
- Streaming, cancelación, timeouts y diagnósticos de conexión.
- Ollama, LM Studio, OpenAI, Anthropic, Google Gemini, NVIDIA API, Z.AI y endpoints personalizados compatibles con OpenAI.
- API keys guardadas mediante el almacén seguro del sistema operativo.
- Selección de modelos y control de esfuerzo cuando el modelo lo permite.
- Operaciones de archivos con revisión y modos de permiso.
- Ejecución restringida de pruebas, compilación y comprobaciones con aprobación.
- Catálogo de modelos locales para Ollama y LM Studio.
- Temas claro/oscuro y 12 idiomas.
- Avisos de actualizaciones desde GitHub Releases.

## Seguridad

NovaAI Code bloquea rutas absolutas, `..`, enlaces simbólicos, carpetas ignoradas, nombres inseguros de Windows, operadores de shell y comandos de sistema sin restricciones. Los proveedores externos reciben únicamente los mensajes y el contexto seleccionado para cada solicitud.

Lee [SECURITY.md](SECURITY.md) antes de activar permisos de agente y [PRIVACY.md](PRIVACY.md) para saber cuándo el código puede salir del equipo.

## Instalación

El instalador estará disponible en Releases cuando existan versiones públicas. Windows puede mostrar una advertencia de SmartScreen mientras el proyecto no disponga de un certificado de firma de código reconocido.

Los usuarios finales no necesitan instalar Node.js ni Rust.

## Desarrollo

Requisitos: Node.js 22+, Rust estable, Microsoft C++ Build Tools y los requisitos de WebView2 para Tauri 2.

```bash
npm install
npm run tauri dev
```

```bash
npm run test:all
npm run tauri build -- --bundles nsis
```

Consulta [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md) y [CHANGELOG.md](CHANGELOG.md).

## Independencia y marcas

NovaAI Code es un proyecto independiente y no está afiliado, respaldado ni patrocinado por OpenAI, Anthropic, Google, NVIDIA, Ollama, LM Studio, Z.AI ni otros proveedores compatibles. Las marcas y logotipos pertenecen a sus propietarios. Consulta [TRADEMARKS.md](TRADEMARKS.md).

## Licencia

Publicado bajo la [licencia Apache 2.0](LICENSE).
