# Product

<!-- impeccable:product-schema 1 -->

Tier Together is a Discord Activity for friends and communities who want to rank games, films, characters, food, or any other shared interest while they are already talking. The promise is deliberately simple: open a list, settle it together, and leave with a result worth sharing. It should feel at home inside Discord without borrowing Discord’s identity, and it should never ask people to create another account just to take part.

The product supports two different kinds of conversation. Live Board gives the room one shared surface where items can be moved and reordered immediately. Vote Together collects private choices and reveals the group result only when the round ends. In both cases the server owns the final state, the host controls the session, and reconnecting participants receive the current board instead of trying to reconstruct it from their browser. The recap celebrates agreement and disagreement without describing anyone as the best or worst voter.

The normal setting is a Discord voice call, but the interface also has to survive narrow embedded frames, touch screens, television-distance layouts, keyboard-only use, and controller navigation. Dragging is a convenience rather than a requirement: selecting an item, choosing a tier, and choosing its position must complete the same task. Focus should always remain visible, tier labels must carry meaning without color, motion should respect system preferences, and status changes should be announced without revealing private votes early.

This release is intentionally temporary. Discord identity is used for the current room, while boards, participants, images, and ballots remain in server memory and disappear after the room expires or the process restarts. There is no application database, public template marketplace, profile system, or saved session history. Built-in images ship with the app; custom images belong only to the active session. A completed PNG is held only long enough to move the generated file from the Discord frame to the user’s browser.

The visual character is dark, direct, and social, with generous item art, unmistakable tier colors, strong typography, and enough restraint to keep a busy board readable. The working line is “Settle the ranking without leaving the call.” The name, mark, and supporting artwork under `public/brand/` and `public/discord-assets/` are the reference assets for future design work.

Success is a completed multiplayer ranking, not a page view. The useful signals are how quickly the first item is placed, whether groups finish, whether reconnects recover cleanly, and whether people export the result. New features should earn their place by improving that session. Persistent accounts, public publishing, recommendation feeds, and monetization are outside the product until there is a clear reason to change that decision.
