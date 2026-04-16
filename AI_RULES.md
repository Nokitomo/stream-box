# AI_RULES.md

## Tech Stack (5‑10 bullet points)

- **HTML5** – markup language for the page structure.  
- **CSS3 (Tailwind CSS)** – utility‑first styling framework used for layout, colors, spacing, and responsive design.  
- **Vanilla JavaScript (ES6+)** – client‑side scripting for interactivity, DOM manipulation, and event handling.  
- **Vite (or simple static server)** – development server and build tool for live reloading and asset bundling.  
- **ESLint + Prettier** – code quality and formatting standards for JavaScript and CSS.  

## Library Usage Rules

1. **Component Structure**  
   - Keep reusable UI pieces as separate HTML snippets or JavaScript modules under `src/components/` if needed.  
   - Use Tailwind classes for styling; avoid custom CSS unless absolutely necessary.  

2. **Styling**  
   - All styling must be done with Tailwind utility classes in `styles.css`.  
   - Do not add global CSS rules that conflict with the existing design system.  

3. **Icons**  
   - Use SVG icons from the **lucide‑react** package only if they are embedded as inline SVGs; otherwise, use plain SVG files.  
   - Do not import external icon fonts or image‑based icons.  

4. **Routing**  
   - The app is a single‑page static site; navigation is handled via anchor links or JavaScript if needed.  
   - No React Router or client‑side routing libraries.  

5. **State Management**  
   - Manage UI state with plain JavaScript variables, `Map`, or the browser’s `localStorage`/`sessionStorage`.  
   - Do not introduce external state management libraries.  

6. **Data Fetching**  
   - Use the native `fetch` API for any network requests.  
   - Do not add third‑party HTTP client libraries.  

7. **Animations & Interactions**  
   - Leverage Tailwind’s transition and animation utilities or CSS keyframes.  
   - Keep JavaScript interactions lightweight; avoid heavy animation libraries.  

8. **Testing**  
   - If tests are required, use a simple testing setup like Jest for JavaScript functions.  
   - Do not mix other testing frameworks.  

9. **Dependencies**  
   - Only add npm packages that are essential (e.g., Tailwind, Vite).  
   - New packages must be installed via the UI’s **Rebuild** command after adding them with `<dyad-add-dependency>`.  

10. **Code Quality**  
    - Keep files small (≤ 100 lines) and focused on a single responsibility.  
    - Follow existing naming conventions: lower‑case folder names, descriptive file names.  

---  

*All contributors should follow these rules to keep the project clean, consistent, and performant.*