# NovaAI Code

NovaAI Code es un asistente de programación de escritorio, open source y centrado en IA local. El proyecto está en una fase temprana de desarrollo.

## Funciones actuales

- Abrir y recordar una carpeta de proyecto.
- Explorar archivos respetando `.gitignore` y exclusiones habituales.
- Abrir varios archivos en pestañas.
- Editar con números de línea y resaltado de sintaxis.
- Crear, guardar, renombrar y eliminar archivos o carpetas.
- Copiar rutas y mostrar elementos en el Explorador de Windows.
- Bloquear operaciones fuera del proyecto, enlaces simbólicos y archivos binarios o demasiado grandes.

## Desarrollo

Requisitos de desarrollo: Node.js, Rust y las dependencias de Tauri para Windows. Los usuarios del instalador no necesitan instalar estas herramientas.

```bash
npm install
npm run tauri dev
```

Crear el instalador de Windows:

```bash
npm run tauri build -- --bundles nsis
```

## Estado

NovaAI Code todavía no conecta proveedores de IA ni ejecuta comandos. Estas capacidades se incorporarán en versiones posteriores.
