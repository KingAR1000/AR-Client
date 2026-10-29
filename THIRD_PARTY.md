# Third-party components and services

AR Client source: GPL-3.0-only. User-supplied AR logos: KingAR1000.

The website bundles Barlow Condensed (Jeremy Tribby) and DM Sans (its respective authors), licensed under SIL Open Font License 1.1. Their full copyright and license notices are retained in `website/assets/BARLOW-OFL.txt` and `website/assets/DM-SANS-OFL.txt`. Fonts are served locally; no Google Fonts requests are needed at runtime. The flat AR mark is a cleaned rendering based on the owner's supplied artwork. The website's voxel landscape is original procedural canvas artwork and includes no Minecraft textures or game assets.

Major dependencies include Tauri (MIT/Apache-2.0), React (MIT), TypeScript (Apache-2.0), Vite/Vitest (MIT), Lucide icons (ISC), skinview3d (MIT), Three.js (MIT), Rust crates listed in Cargo.lock, Fabric Loader/API (Apache-2.0), Fabric Loom (MIT), Yarn mappings (CC0), and Eclipse Temurin/OpenJDK runtimes (GPLv2 with Classpath Exception and associated notices). Consult each pinned dependency's license for authoritative terms; retain required notices in distributions.

Minecraft game files are downloaded directly from Mojang and governed by the Minecraft EULA, not this repository's GPL. Mods/resource packs keep their authors' licenses. Modrinth, CurseForge, Microsoft/Xbox/Minecraft Services, GitHub, Fabric, Quilt, Forge, NeoForge and Adoptium have independent service and redistribution terms. This repository does not grant rights to redistribute their content. Forge/NeoForge installers execute code from their official distribution sites after checksum verification.
