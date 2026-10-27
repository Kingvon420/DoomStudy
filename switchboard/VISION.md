# Switchboard

**One world. One party. Every game.**

You and your friends load into one shared city. Walk the crew into the HOOPS portal and you're in a 2K-style game. Walk out and into GRIDIRON and you're running a Madden-style drive. Next door, WARZONE is a squad shooter. You keep the same crew, the same wallet and the same controls the whole time, with no lobby screens and no separate launchers.

It's Ready Player One's OASIS, or a GTA city where every building is a different game.

## The core idea: think like Linux

Linux has a **kernel** (the part that never changes) and **programs** you install on top. Switchboard works the same way:

```
            ┌───────────────────────────────────────────────┐
            │                    KERNEL                     │
            │  party · wallet · input · camera · world map  │
            └───────▲───────────▲───────────▲───────────▲───┘
                    │           │           │           │
               ┌────┴───┐  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
               │ HOOPS  │  │GRIDIRON │ │ WARZONE │ │  + ANY  │
               │ (2K)   │  │(Madden) │ │  (COD)  │ │  GAME   │
               └────────┘  └─────────┘ └─────────┘ └─────────┘
                           cartridges (plug-ins)
```

Every game is a **cartridge** that agrees to one small contract:

| Step | What the game does |
|---|---|
| `enter(ctx)` | Receives your party and profile from the kernel |
| `update(dt)` | Runs its rules, reading the shared `input` |
| `draw(g)` | Draws its world |
| `ctx.finish({score, coins, summary})` | Hands results back; kernel pays the wallet and returns you to the plaza |

Call `OS.register(...)` with a new cartridge and a new portal appears in the plaza automatically. That's where the "endless possibilities" come from: the world grows by adding plug-ins, and nobody has to rebuild the world itself.

## What's in the prototype (`index.html`)

- **The Plaza**: the hub world. Your crew (YOU, DRE, MIA, KAI) follows you around.
- **HOOPS**: a shot-meter shootout. Release in the green; behind the arc is worth 3; a defender contests you.
- **GRIDIRON**: you're the ball carrier, your crew blocks, and you get 4 downs to score. A = spin move.
- **WARZONE**: squad survival with auto-aim, cover and waves. Your crew fights beside you.
- **+ ADD GAME**: the open slot. It shows the code for plugging in a new game.
- **Shared wallet**: coins from every game go to one balance, saved in the browser.

Controls: WASD/arrows + Space on keyboard. On a phone, the left thumb steers and the right thumb is the A button.

## Roadmap: from prototype to a real metaverse

1. **Real multiplayer.** Put the kernel on a server (WebSockets / an authoritative game server) so the four party members are four real people.
2. **3D.** Swap the 2D canvas for a 3D engine (Three.js in the browser, or Unreal/Unity/Godot natively). The kernel/cartridge contract stays the same.
3. **Persistent identity.** Accounts, avatars, cosmetics and one inventory that carries between every game.
4. **Creator SDK.** Publish the cartridge contract so outside developers can ship games into the world, the way Roblox and Fortnite Creative do.
5. **Sandboxing.** Run third-party cartridges isolated (WebAssembly / separate processes) so one bad game can't break the world, just like Linux protects the kernel from programs.

## Who's already circling this idea

- **Fortnite (UEFN)**: one launcher with Battle Royale, LEGO, racing and creator islands.
- **Roblox**: millions of user-made games under one account and one currency.
- **Rec Room / VRChat**: social hubs where you walk between game rooms.

None of them has licensed AAA sports + shooters running side by side in one shared city yet. That's the opening.
