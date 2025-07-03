/** @type {import('vite').UserConfig} */
export default {
    // Specifies that the project's root directory (where index.html is located) is the 'src' folder.
    root: 'src',
    
    build: {
        // Tells Vite to compile for modern browsers that support the latest JavaScript features.
        // This results in a smaller, more efficient build.
        target: 'esnext',
        
        // Specifies the output directory for the final build files.
        // '../dist' means it will create a 'dist' folder in the project's main directory, outside of 'src'.
        outDir: '../dist',
        
        // Ensures that the output directory ('dist') is cleared of old files before each new build.
        emptyOutDir: true,
    }
}