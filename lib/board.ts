export interface Tier {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

export interface BoardItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly imageId?: string;
  readonly imageUrl?: string;
  readonly showName?: boolean;
}

export interface TierTemplate {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly themeColor: string;
  readonly tiers: readonly Tier[];
  readonly items: readonly BoardItem[];
}

export interface BoardState {
  readonly revision: number;
  readonly mode: "live" | "vote";
  readonly phase: "lobby" | "live" | "voting" | "finished";
  readonly locked: boolean;
  readonly hostId: string;
  readonly templateId: string;
  readonly templateTitle: string;
  readonly templateCategory: string;
  readonly themeColor: string;
  readonly tiers: readonly Tier[];
  readonly items: readonly BoardItem[];
  readonly lanes: Readonly<Record<string, readonly string[]>>;
}

export interface MoveItemOperation {
  readonly itemId: string;
  readonly tierId: string;
  readonly beforeItemId: string | null;
}

export class BoardRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardRuleError";
  }
}

export const UNRANKED_LANE_ID = "unranked";
export const MAX_BOARD_ITEMS = 80;
export const MAX_IMAGE_ITEMS = 12;
export const MAX_ITEM_IMAGE_LENGTH = 12_000;

export const DEFAULT_TIERS: readonly Tier[] = [
  { id: "s", label: "S", color: "#ff665c" },
  { id: "a", label: "A", color: "#ffad4d" },
  { id: "b", label: "B", color: "#e8cf55" },
  { id: "c", label: "C", color: "#73b88b" },
  { id: "d", label: "D", color: "#6d8fbc" },
];

function makeItems(category: "games" | "movies" | "series", names: readonly string[]): readonly BoardItem[] {
  return names.map((name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return {
      id: `${category}-${slug}`,
      name,
      icon: "",
      imageUrl: `/template-images/${category}/${slug}.jpg`,
    };
  });
}

const GAME_ITEMS = makeItems("games", [
  "Minecraft", "Portal 2", "Hades", "Baldur's Gate 3", "Stardew Valley", "Elden Ring",
  "Hollow Knight", "Celeste", "Red Dead Redemption 2", "The Witcher 3", "Terraria", "Overwatch 2",
  "Fortnite", "Rocket League", "Valorant", "League of Legends", "Apex Legends", "Counter-Strike 2",
  "Grand Theft Auto V", "The Last of Us", "God of War", "Cyberpunk 2077", "Resident Evil 4", "Skyrim",
  "Super Mario Odyssey", "The Legend of Zelda", "Animal Crossing", "Dead Cells", "Among Us", "It Takes Two",
]);

const MOVIE_ITEMS = makeItems("movies", [
  "The Godfather", "The Dark Knight", "Pulp Fiction", "The Shawshank Redemption", "Parasite", "Spirited Away",
  "The Matrix", "Inception", "Interstellar", "Goodfellas", "Alien", "Jurassic Park", "Jaws", "Gladiator",
  "Whiplash", "Mad Max: Fury Road", "The Social Network", "Everything Everywhere All at Once", "Get Out", "Moonlight",
  "The Grand Budapest Hotel", "Blade Runner 2049", "Arrival", "The Silence of the Lambs", "Fight Club", "Titanic",
  "Back to the Future", "The Lord of the Rings", "Star Wars", "Toy Story",
]);

const SERIES_ITEMS = makeItems("series", [
  "Breaking Bad", "The Sopranos", "The Wire", "Game of Thrones", "Succession", "Better Call Saul",
  "The Bear", "Severance", "Stranger Things", "Dark", "The Office", "Friends", "The Simpsons", "Fleabag",
  "Atlanta", "Mr. Robot", "Black Mirror", "Chernobyl", "Arcane", "BoJack Horseman", "Attack on Titan",
  "The Last of Us", "House of the Dragon", "Peaky Blinders", "Sherlock", "Mindhunter", "Narcos", "Lost",
  "Twin Peaks", "Avatar: The Last Airbender",
]);

export const DEFAULT_ITEMS = GAME_ITEMS;

export const TEMPLATE_CATALOG: readonly TierTemplate[] = [
  {
    id: "games",
    title: "Games",
    category: "Games",
    description: "Rank thirty defining games across genres and generations.",
    themeColor: "#4466ff",
    tiers: DEFAULT_TIERS,
    items: GAME_ITEMS,
  },
  {
    id: "movies",
    title: "Movies",
    category: "Movies",
    description: "Compare thirty acclaimed, popular, and influential films.",
    themeColor: "#d95763",
    tiers: [
      { id: "masterpiece", label: "Masterpiece", color: "#d95763" },
      { id: "great", label: "Great", color: "#e18d4f" },
      { id: "good", label: "Good", color: "#d7bd55" },
      { id: "mixed", label: "Mixed", color: "#70a58a" },
      { id: "skip", label: "Skip", color: "#6987a6" },
    ],
    items: MOVIE_ITEMS,
  },
  {
    id: "series",
    title: "Series",
    category: "Series",
    description: "Rank thirty landmark live-action and animated series.",
    themeColor: "#3ca4b8",
    tiers: [
      { id: "essential", label: "Essential", color: "#3ca4b8" },
      { id: "binge", label: "Binge", color: "#668fd1" },
      { id: "solid", label: "Solid", color: "#8d7bc4" },
      { id: "uneven", label: "Uneven", color: "#b37a83" },
      { id: "drop", label: "Drop", color: "#7f8995" },
    ],
    items: SERIES_ITEMS,
  },
];

export const DEFAULT_TEMPLATE_ID = TEMPLATE_CATALOG[0].id;

export function createBoard(hostId: string, templateId = DEFAULT_TEMPLATE_ID): BoardState {
  const template = TEMPLATE_CATALOG.find((candidate) => candidate.id === templateId) ?? TEMPLATE_CATALOG[0];
  const lanes: Record<string, readonly string[]> = {
    [UNRANKED_LANE_ID]: template.items.map((item) => item.id),
  };
  for (const tier of template.tiers) lanes[tier.id] = [];

  return {
    revision: 0,
    mode: "live",
    phase: "lobby",
    locked: false,
    hostId,
    templateId: template.id,
    templateTitle: template.title,
    templateCategory: template.category,
    themeColor: template.themeColor,
    tiers: template.tiers,
    items: template.items,
    lanes,
  };
}

export function setBoardTemplate(board: BoardState, actorId: string, templateId: string): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "lobby") throw new BoardRuleError("The template can only change in the lobby.");
  const template = TEMPLATE_CATALOG.find((candidate) => candidate.id === templateId);
  if (template === undefined) throw new BoardRuleError("That template does not exist.");
  if (board.templateId === template.id) return board;

  const lanes: Record<string, readonly string[]> = {
    [UNRANKED_LANE_ID]: template.items.map((item) => item.id),
  };
  for (const tier of template.tiers) lanes[tier.id] = [];

  return {
    ...board,
    revision: board.revision + 1,
    templateId: template.id,
    templateTitle: template.title,
    templateCategory: template.category,
    themeColor: template.themeColor,
    tiers: template.tiers,
    items: template.items,
    lanes,
  };
}

export interface BoardConfiguration {
  readonly title: string;
  readonly themeColor: string;
  readonly tiers: readonly Tier[];
  readonly items: readonly BoardItem[];
}

export function configureBoard(
  board: BoardState,
  actorId: string,
  configuration: BoardConfiguration,
): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "lobby") throw new BoardRuleError("The list can only be customized in the lobby.");

  const title = configuration.title.trim();
  if (title.length === 0 || title.length > 80) throw new BoardRuleError("List titles must be 1-80 characters.");
  if (!isHexColor(configuration.themeColor)) throw new BoardRuleError("Choose a valid accent color.");
  if (configuration.tiers.length < 3 || configuration.tiers.length > 10) {
    throw new BoardRuleError("A list needs between 3 and 10 tiers.");
  }
  if (configuration.items.length < 1 || configuration.items.length > MAX_BOARD_ITEMS) {
    throw new BoardRuleError(`A list needs between 1 and ${MAX_BOARD_ITEMS} items.`);
  }

  const tierIds = new Set<string>();
  for (const tier of configuration.tiers) {
    const label = tier.label.trim();
    if (!tier.id || tierIds.has(tier.id)) throw new BoardRuleError("Tier IDs must be unique.");
    if (label.length === 0 || label.length > 12) throw new BoardRuleError("Tier labels must be 1-12 characters.");
    if (!isHexColor(tier.color)) throw new BoardRuleError("Choose a valid color for every tier.");
    tierIds.add(tier.id);
  }

  const itemIds = new Set<string>();
  let imageCount = 0;
  for (const item of configuration.items) {
    const name = item.name.trim();
    if (!item.id || itemIds.has(item.id)) throw new BoardRuleError("Item IDs must be unique.");
    if (name.length > 80) throw new BoardRuleError("Item names must be 80 characters or fewer.");
    if (item.icon.length > 16) throw new BoardRuleError("Item icons are too long.");
    if (item.imageId !== undefined) imageCount += 1;
    if (name.length === 0 && item.imageId === undefined && item.icon.length === 0) {
      throw new BoardRuleError("Each item needs a name, icon, or image.");
    }
    itemIds.add(item.id);
  }
  if (imageCount > MAX_IMAGE_ITEMS) {
    throw new BoardRuleError(`A session can contain up to ${MAX_IMAGE_ITEMS} item photos.`);
  }

  const tiers = configuration.tiers.map((tier) => ({ ...tier, label: tier.label.trim() }));
  const items = configuration.items.map((item) => ({ ...item, name: item.name.trim() }));
  const lanes: Record<string, readonly string[]> = {
    [UNRANKED_LANE_ID]: items.map((item) => item.id),
  };
  for (const tier of tiers) lanes[tier.id] = [];

  return {
    ...board,
    revision: board.revision + 1,
    templateId: "custom",
    templateTitle: title,
    templateCategory: "Custom",
    themeColor: configuration.themeColor,
    tiers,
    items,
    lanes,
  };
}

export function setBoardMode(board: BoardState, actorId: string, mode: BoardState["mode"]): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "lobby") throw new BoardRuleError("The mode can only change in the lobby.");
  if (board.mode === mode) return board;
  return { ...board, mode, revision: board.revision + 1 };
}

export function startBoard(board: BoardState, actorId: string): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "lobby") throw new BoardRuleError("The session has already started.");
  return { ...board, phase: board.mode === "vote" ? "voting" : "live", revision: board.revision + 1 };
}

export function setBoardLocked(
  board: BoardState,
  actorId: string,
  locked: boolean,
): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "live") throw new BoardRuleError("Only a live board can be locked.");
  if (board.locked === locked) return board;
  return { ...board, locked, revision: board.revision + 1 };
}

export function finishBoard(board: BoardState, actorId: string): BoardState {
  requireHost(board, actorId);
  if (board.phase !== "live" && board.phase !== "voting") {
    throw new BoardRuleError("Only an active session can be finished.");
  }
  return { ...board, phase: "finished", locked: true, revision: board.revision + 1 };
}

export function placeVoteResult(board: BoardState, itemId: string, tierId: string): BoardState {
  if (board.mode !== "vote" || board.phase !== "voting") {
    throw new BoardRuleError("There is no active voting round.");
  }
  const placed = moveItem(
    { ...board, phase: "live", locked: false },
    { itemId, tierId, beforeItemId: null },
  );
  return { ...placed, phase: "voting" };
}

export function moveItem(board: BoardState, operation: MoveItemOperation): BoardState {
  assertBoardIntegrity(board);
  if (board.phase !== "live") throw new BoardRuleError("The board is not accepting moves.");
  if (board.locked) throw new BoardRuleError("The host has locked the board.");
  if (!board.items.some((item) => item.id === operation.itemId)) {
    throw new BoardRuleError("That item does not exist.");
  }
  if (operation.tierId !== UNRANKED_LANE_ID &&
    !board.tiers.some((tier) => tier.id === operation.tierId)) {
    throw new BoardRuleError("That tier does not exist.");
  }

  const sourceLaneId = Object.keys(board.lanes).find((laneId) =>
    board.lanes[laneId]?.includes(operation.itemId)
  );
  if (sourceLaneId === undefined) throw new BoardRuleError("That item is not on the board.");

  const lanes: Record<string, string[]> = {};
  for (const [laneId, itemIds] of Object.entries(board.lanes)) {
    lanes[laneId] = itemIds.filter((itemId) => itemId !== operation.itemId);
  }

  const targetLane = lanes[operation.tierId];
  if (targetLane === undefined) throw new BoardRuleError("That lane does not exist.");
  const targetIndex = operation.beforeItemId === null
    ? targetLane.length
    : targetLane.indexOf(operation.beforeItemId);
  if (targetIndex < 0) throw new BoardRuleError("The target position is no longer available.");
  targetLane.splice(targetIndex, 0, operation.itemId);

  const nextBoard: BoardState = {
    ...board,
    revision: board.revision + 1,
    lanes,
  };
  assertBoardIntegrity(nextBoard);
  return nextBoard;
}

export function assertBoardIntegrity(board: BoardState): void {
  const itemIds = new Set(board.items.map((item) => item.id));
  if (itemIds.size !== board.items.length) throw new BoardRuleError("Item IDs must be unique.");

  const placedIds = Object.values(board.lanes).flat();
  if (placedIds.length !== itemIds.size || new Set(placedIds).size !== placedIds.length) {
    throw new BoardRuleError("Every item must appear in exactly one lane.");
  }
  if (placedIds.some((itemId) => !itemIds.has(itemId))) {
    throw new BoardRuleError("A lane contains an unknown item.");
  }
}

function requireHost(board: BoardState, actorId: string): void {
  if (actorId !== board.hostId) throw new BoardRuleError("Only the host can do that.");
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
