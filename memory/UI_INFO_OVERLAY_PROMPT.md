# Prompt Riutilizzabile - Info Overlay Glass (Genie)

Usa questo prompt quando vuoi l'effetto `Informazioni` uguale tra le tab.

## Obiettivo
Quando clicco la `i`:
- si apre un pannello glass con animazione "genie" (zoom + slide);
- tutta la tab sotto va in blur/dim e non e cliccabile;
- il pannello info resta leggibile e sopra a tutto.

## Parametri richiesti
- `initial`: `{ opacity: 0, scale: 0, y: -20 }`
- `animate`: `{ opacity: 1, scale: 1, y: 0 }`
- `exit`: `{ opacity: 0, scale: 0, y: -20 }`
- `transition`: `{ type: "spring", stiffness: 350, damping: 25, mass: 0.6 }`
- `style`: `{ transformOrigin: "top left", willChange: "transform, opacity, filter" }`
- overlay esterna: `bg-[#0F1115]/20 backdrop-blur-[6px]`

## Snippet JSX
```jsx
<AnimatePresence>
  {showInfo && (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0, y: -20 }}
      transition={{
        type: "spring",
        stiffness: 350,
        damping: 25,
        mass: 0.6
      }}
      style={{ transformOrigin: 'top left', willChange: 'transform, opacity, filter' }}
      className="absolute inset-3 z-50 bg-[#0F1115]/20 backdrop-blur-[6px] rounded-[24px]"
    >
      <div className="relative px-8 py-6 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
        {/* contenuto guida */}
      </div>
    </motion.div>
  )}
</AnimatePresence>

<div
  className={cn(
    "transition-all duration-200",
    showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
  )}
>
  {/* contenuto normale della tab */}
</div>
```

## Regola di coerenza
Applicare lo stesso comportamento a tutte le tab (`Screening`, `Options`, `COT`, `GEX` e nuove tab) per mantenere UX uniforme.
