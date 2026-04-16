# AI_RULES.md

## Tech Stack (5‑10 bullet points)

- **React with TypeScript** – core UI framework, all components are written in `.tsx` files.  
- **Tailwind CSS** – utility‑first styling, used throughout the app for layout, colors, spacing, etc.  
- **shadcn/ui** – pre‑built, accessible UI primitives (buttons, dialogs, etc.) that should be imported when a custom component is needed.  
- **Radix UI** – low‑level accessible primitives that power shadcn/ui components; use only via shadcn wrappers.  
- **lucide‑react** – icon library for SVG icons; import icons directly from this package.  
- **React Router** – routing is defined in `src/App.tsx`; keep all page components under `src/pages/`.  
- **Vite (or Create React App)** – development server and build tool; run via the UI’s **Rebuild** / **Restart** commands.  
- **ESLint + Prettier** – code quality and formatting standards; follow the existing configuration.  

## Library Usage Rules

1. **Component Creation**  
   - New UI pieces must be created as separate files in `src/components/`.  
   - Prefer shadcn/ui components (e.g., `Button`, `Dialog`) for consistency and accessibility.  

2. **Styling**  
   - Use Tailwind classes exclusively; avoid custom CSS files unless absolutely necessary.  
   - Do not add global styles that conflict with the existing design system.  

3. **Icons**  
   - Import icons only from `lucide-react`.  
   - Do not use external icon packs or image files for icons.  

4. **Routing**  
   - Add new routes only in `src/App.tsx` using React Router `<Route>` elements.  
   - Page components belong in `src/pages/` and must be exported as default.  

5. **State Management**  
   - Use React’s built‑in `useState`, `useReducer`, or Context API.  
   - Do **not** add external state libraries (e.g., Redux, Zustand) unless a future requirement explicitly demands them.  

6. **Data Fetching**  
   - For any API calls, use the native `fetch` API or `axios` if already present.  
   - Do not introduce new HTTP client libraries without justification.  

7. **Animations & Interactions**  
   - Leverage Tailwind’s transition utilities or shadcn/ui’s built‑in animation props.  
   - Avoid heavy animation libraries (e.g., GSAP) to keep bundle size low.  

8. **Testing**  
   - If tests are added, use the existing testing framework (Jest + React Testing Library).  
   - Do not mix other testing tools.  

9. **Dependencies**  
   - Only add npm packages that are essential and not already in `package.json`.  
   - New packages must be installed via the UI’s **Rebuild** command after adding them with `<dyad-add-dependency>`.  

10. **Code Quality**  
    - Keep files small (≤ 100 lines) and focused on a single responsibility.  
    - Follow the existing naming conventions: lower‑case folder names, PascalCase component files.  

---  

*All developers should adhere to these rules to maintain a clean, consistent, and performant codebase.*