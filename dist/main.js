const boardElement = document.getElementById("board");
const actions = document.getElementById("actions");

const footer = document.querySelector("footer");
const hideFooterButton = document.getElementById("hide-footer");

const inspectModeStatus = document.getElementById("inspect-status");

const boardHeight = 25;
const boardWidth = 50;

/**
 * Represents the Message Log UI element, showing game information.
 */
class MessageLog {
    /**
     * Create a new Message Log. Constructor should be called only once – this
     * class is a Singleton.
     * @param element
     */
    constructor(element) {
        this.element = element;
        this.messages = []
    }


    /**
     * Clear the message log.
     * @return void
     */
    clear() {
        this.element.innerHTML = ""
        this.messages = [];
    }

    /**
     * Write a message to the log.
     * @param  {String} message - the message to write to the log
     */
    log(message) {
        this.messages.push(message)
        const messageEl = document.createElement("li");
        const innerParagraph = document.createElement("p");

        innerParagraph.textContent = message;

        // Before adding a new element, check if user has scrolled up
        // (to not abruptly scroll while user was reading something in the log)
        // const parent = this.element.parentElement
        const shouldScroll =
            this.element.scrollHeight - (this.element.scrollTop + this.element.clientHeight) <= 96;

        // console.log(this.element.scrollHeight - (this.element.scrollTop + this.element.clientHeight))

        messageEl.appendChild(innerParagraph);
        this.element.appendChild(messageEl);

        // Scroll to the bottom.
        if (shouldScroll)
        // Delay before scrolling so our `appendChild` goes through.
            setTimeout(() => {
                this.element.scrollTo({
                    top: this.element.scrollHeight,
                    left: 0,
                    behavior: 'smooth'
                });
            }, 100)

    }

    /**
     * Amend the message immediately preceding the latest message.
     * @param  {String} message - the message to write to the log
     * @return {Boolean} false if the message could not be edited, `true` otherwise.
     */
    amend(message) {
        const previousMessage = this.element.lastChild;

        if (previousMessage !== null) {
            previousMessage.textContent += message;
            return true;
        }
        return false;
    }
}

const messageLog = new MessageLog(document.getElementById("messages"))

// Represents a popup menu
class Menu {
    constructor() {
        this.element = document.createElement("dialog");
        this.element.setAttribute("role", "group"); // for a11y. maybe wrong? FIXME
    }

    show(previous) {
        if(previous) {
            this.previousMenu = previous;
        }
        // Show the menu
        show(this.element);
        boardElement.parentElement.appendChild(this.element);
        this.element.open = true;
        this.element.toggleAttribute("open", true);
    }

    hide(options) {
        if (options === undefined || options.showPrevious === undefined || options.showPrevious) {
            if (this.previousMenu) {
                // messageLog.log("uhh menu")
                this.previousMenu.show()
            }
        }
        // Hide the menu.
        hide(this.element);
        boardElement.parentElement.removeChild(this.element);
        this.element.open = false;
        this.element.toggleAttribute("open", false);
    }

    addNodes(nodes) {
        const fragment = document.createDocumentFragment();
        for (let key in nodes) {
            const node = nodes[key];
            const child = document.createElement(node.tag);
            node.element = child;
            if (node.classes && node.classes.length > 0)
                child.classList.add(...node.classes);
            if (node.id)
                child.id = node.id;
            if (node.text)
                child.textContent = node.text;
            fragment.appendChild(child);
        }
        this.element.appendChild(fragment);
    }
}


function getSaves() {
    return new Promise(((resolve) => {
        ajaxGET("/saves", res => {
            const parser = new DOMParser();
            resolve(JSON.parse(res).map(saveData =>
                Save.fromDocument(
                    parser.parseFromString(saveData, "text/xml")
                ))
            )
        })
    }));
}

// Represents the “Saves” menu

class SavesMenu extends Menu {
    constructor() {
        super();
        this.element.setAttribute("id", "saves_menu");
        this.element.classList.add("saves-menu");

        // K-V store of all the child nodes
        this.nodes = {
            xbutton: [document.createElement("button"), "[X]"],
            heading: [document.createElement("h2"), "Save Files"],
            refresh: [document.createElement("button"), "(Refresh)"],
            loader: [document.createElement("p"), "Loading saves…"],
            list: [document.createElement("ol"), ""],
            currentView: [document.createElement("table"), ""],
            loadButton: [document.createElement("button"), "Load File!"],
        }

        // Populate the main node with the children declared previously
        for (let key in this.nodes) {
            const child = this.nodes[key][0]
            child.textContent = this.nodes[key][1]
            this.element.appendChild(child)
        }

        // Add tabindex properties to the buttons
        this.nodes.xbutton[0].setAttribute("tabindex", "0");
        this.nodes.refresh[0].setAttribute("tabindex", "0");
        this.nodes.loadButton[0].setAttribute("tabindex", "0");

        // Set the elements’ IDs and classes
        this.nodes.xbutton[0].id = "xbutton";
        this.nodes.xbutton[0].classList.add("strong")
        this.nodes.refresh[0].id = "refresh";
        this.nodes.loadButton[0].id = "loadSave";

        // Hide the loadButton until we have saves to show.
        hide(this.nodes.loadButton[0])


        // Wire up the buttons
        this.nodes.refresh[0].addEventListener("click", _ => this.refreshListings());
        this.nodes.xbutton[0].addEventListener("click", _ => this.hide())
        this.nodes.loadButton[0].addEventListener("click", _ => this.loadCurrentSave())
    }

    loadCurrentSave() {
        currentCharacter = Character.fromSave(this.currentSaveData);
        messageLog.log(`Loaded save file ${this.currentSaveIndex + 1}. (${currentCharacter})`)
        this.hide({showPrevious: false}); // hide this menu and the previous menu
    }

    /**
     * Clear the displayed listings, ask the server for saves, re-display.
     * @return void
     */
    refreshListings() {
        const listNode = this.nodes.list[0];
        const loaderNode = this.nodes.loader[0];
        const detailsElement = this.nodes.currentView[0];
        const loadButton = this.nodes.loadButton[0];
        // Clear displayed listings
        listNode.innerHTML = "";

        // Clear displayed stats
        detailsElement.innerHTML = ""

        // Hide the “Load File” button
        hide(loadButton);

        // Show the “loading” message
        show(loaderNode);

        // Ask the server for saves,
        getSaves().then(saves => {
            const elements = document.createDocumentFragment();
            // Unfocus the currently-focused element.
            document.activeElement.blur()

            // Put listings into a fragment
            for (const [index, save] of saves.entries()) {
                const saveListing = save.getListing();
                saveListing.addEventListener("click", this.displayDetail(save, saveListing, index));
                elements.appendChild(saveListing);
            }

            // Fake a little delay, then:
            setTimeout(() => {
                // Hide the “loading” message.
                hide(loaderNode)
                // Clear the listings. (Again, because spamming the button will cause issues.)
                listNode.innerHTML = "";
                // Display the listings fragment.
                listNode.appendChild(elements);
                // Focus on the first element.
                listNode.firstChild.firstChild.focus()
                // Click on it.
                listNode.firstChild.firstChild.click()
            }, 250)
        });
    }

    show(previous) {
        // A11y: Indicate that the button can be accessed.
        this.nodes.refresh[0].setAttribute("tabindex", "0");
        // Show the menu.
        super.show(previous);
        // Update the menu with new info from the server.
        this.refreshListings();
    }

    hide(options) {
        // A11y: Make the button's tabindex negative.
        // (Indicating that it cannot be accessed right now.)
        this.nodes.refresh[0].setAttribute("tabindex", "-1");
        // Hide the menu.
        super.hide(options);

    }

    /**
     * Return a function that will display detailed information about the
     * currently-selected save file in the details table HTML element.
     * @param {Save} save - the currently-selected save file
     * @param {HTMLElement} listingElement - the <li> element that was activated.
     * @param {Number} index - the index of the <li> element, in its parent list.
     * @returns {(function())|*}
     */
    displayDetail(save, listingElement, index) {
        return () => {
            this.currentSaveData = save;
            this.currentSaveIndex = index;
            const detailsElement = this.nodes.currentView[0];
            detailsElement.innerHTML = save.getTable().innerHTML;

            // Show the “Load File!” button.
            const loadButton = this.nodes.loadButton[0]
            show(loadButton);

            // Edit the button's text to say “Load File 1,” etc.
            loadButton.textContent = `Load File ${this.currentSaveIndex + 1}`

            // Un-highlight all other button elements.
            listingElement.parentElement.querySelectorAll("button[title='Selected Save']").forEach(
                element => element.removeAttribute("title")
            )
            // Highlight this listing's button element.
            listingElement.firstChild.setAttribute("title", "Selected Save")
        }
    }
}

const savesMenu = new SavesMenu();

// Represents the “Character Stats” menu.
// FIXME: Currently, opening multiple menus *will* break stuff.
class CharacterMenu extends Menu {
    constructor() {
        super();
        this.element.setAttribute("id", "character_menu");
        this.element.classList.add("character-menu");

        this.editing = false;

        // K-V store of all the child nodes
        this.nodes = {
            closeButton: [document.createElement("button"), "[X]"],
            heading: [document.createElement("h2"), "Character"],
            loader: [document.createElement("p"), "No character data?"],
            list: [document.createElement("ul"), ""],
            attributes: [document.createElement("table"), ""],
            editButton: [document.createElement("button"), "Edit (Cheating!)"],
            saveButton: [document.createElement("button"), "Save Changes"]
        }

        // TODO: factor more menu code out into a Menu superclass
        // Populate the main node with the children declared previously
        for (let key in this.nodes) {
            const child = this.nodes[key][0]
            child.textContent = this.nodes[key][1]
            this.element.appendChild(child)
        }

        // Add tabindex properties to the buttons
        this.nodes.closeButton[0].setAttribute("tabindex", "0");
        this.nodes.editButton[0].setAttribute("tabindex", "0");
        this.nodes.saveButton[0].setAttribute("tabindex", "-1");

        // Set IDs and classes
        this.nodes.closeButton[0].id = "closeCharacter";
        this.nodes.closeButton[0].classList.add("strong")
        this.nodes.editButton[0].id = "editCharacter";
        this.nodes.saveButton[0].id = "saveCharacter";


        // Wire up the buttons
        this.nodes.editButton[0].addEventListener("click", _ => this.editMode());

        this.nodes.closeButton[0].addEventListener("click", _ => this.hide())

        // Append the element to the DOM
        boardElement.parentElement.appendChild(this.element);
        this.hide();
    }

    editMode() {
        return undefined;
    }

    show(previous) {
        // A11y: Indicate that the relevant buttons can/cannot be accessed.
        this.element.querySelectorAll("button").forEach(
            button => button.setAttribute("tabindex", "0")
        );

        // if (this.editing) {
        //     hide(this.nodes.editButton[0]);
        //     this.nodes.editButton[0].
        // } else {
        //
        // }

        // Show the menu.
        super.show(previous);

        // Update the menu with new info from the server.
        // this.refreshListings();
    }

    hide() {
        // A11y: Indicate that all of the buttons cannot be accessed.
        this.element.querySelectorAll("button").forEach(
            button => button.setAttribute("tabindex", "-1")
        );

        // Hide the menu.
        super.hide();

        // Update the menu with new info from the server.
        // this.refreshListings();
    }

}

const characterMenu = new CharacterMenu();

// Represents the “Save Game” menu.
// FIXME: Currently, opening multiple menus *will* break stuff.
class SaveGameMenu extends Menu {
    constructor() {
        super();
        this.element.setAttribute("id", "save_game_menu");
        this.element.classList.add("save-game-menu");
        // K-V store of all the child nodes
        this.nodes = {
            closeButton: {tag: "button", text: "[X]"},
            heading: {tag: "h2", text: "Save Game"},
            nameField: {tag: "input", text: ""},
            nameLabel: {tag: "label", text: "Filename:"},
            list: {tag: "ul", text: ""},
            saveButton: {tag: "button", text: "Save Game!"}
        }

        // TODO: factor more menu code out into a Menu superclass
        // Populate the main node with the children declared previously
        this.addNodes(this.nodes)

        // Add tabindex properties to the buttons
        this.nodes.closeButton.element.setAttribute("tabindex", "0");
        this.nodes.saveButton.element.setAttribute("tabindex", "-1");

        // Set IDs and classes
        this.nodes.closeButton.element.id = "closeCharacter";
        this.nodes.closeButton.element.classList.add("strong");
        this.nodes.saveButton.element.id = "saveCharacter";

        this.nodes.nameField.element.id = "filename_field";
        this.nodes.nameLabel.element.htmlFor = "filename_field";

        // Wire up the buttons & textfield
        this.nodes.closeButton.element.addEventListener("click", _ => this.hide());
        this.nodes.saveButton.element.addEventListener("click", _ => this.save());

        // Append the element to the DOM
        boardElement.parentElement.appendChild(this.element);
        this.hide();
    }

    editMode() {
        return undefined;
    }

    save() {
        messageLog.log("Saving " + currentCharacter);
        ajaxPOST("/saves", Save.fromCurrent().serialize(), function (response) {
            messageLog.log(response);
        })
        this.hide();
    }

    show(previous) {
        // A11y: Indicate that the relevant buttons can/cannot be accessed.
        this.element.querySelectorAll("button").forEach(
            button => button.setAttribute("tabindex", "0")
        );

        if (currentCharacter === undefined) {
            this.nodes.saveButton.element.toggleAttribute("disabled", true);
            this.nodes.saveButton.element.setAttribute("tabindex", "-1");
        } else {
            this.nodes.saveButton.element.toggleAttribute("disabled", false);
        }

        // Show the menu.
        super.show(previous);

        // Update the menu with new info from the server.
        // this.refreshListings();
    }

    hide() {
        // A11y: Indicate that all of the buttons cannot be accessed.
        this.element.querySelectorAll("button").forEach(
            button => button.setAttribute("tabindex", "-1")
        );

        // Hide the menu.
        super.hide();

        // Update the menu with new info from the server.
        // this.refreshListings();
    }

}

const saveGameMenu = new SaveGameMenu();

// Represents the Main Menu / Splash Screen

class MainMenu extends Menu {
    constructor() {
        super();
        this.element.setAttribute("id", "main_menu");
        this.element.classList.add("main-menu");

        this.nodes = {
            heading: {tag: "h2", text: "Main Menu"},
            closeButton: {tag: "button", text: "[X]", classes: ["closeButton", "strong"]},
            newGameButton: {tag: "button", text: "New Game"},
            loadGameButton: {tag: "button", text: "Load Game"},
            characterStats: {tag: "table", text: ""}
        }

        this.addNodes(this.nodes);

        this.nodes.newGameButton.element.addEventListener("click", () => {
            this.hide();
        })

        this.nodes.loadGameButton.element.addEventListener("click", () => {
            this.hide();
            savesMenu.show(this);
        })

        this.nodes.closeButton.element.addEventListener("click", () => {
            this.hide();
        })

    }

    show(previous) {
        super.show(previous);
        if (currentCharacter == undefined) {
            getSaves().then(saves => {
                console.log(saves)
                this.nodes.characterStats.element.innerHTML = saves[0].getTable().innerHTML;
            });
        } else {
            this.nodes.characterStats.element.innerHTML = currentCharacter.getTable().innerHTML;
        }

    }

}

// Main Menu singleton
const mainMenu = new MainMenu()

/* The current Board. */
let cB;

// The piece the player controls.
let playerPiece;

// The player character.
let currentCharacter;

// The world!
let currentWorld;

// CHEATS
let cheats = {
    buildMode: false,
    inspectMode: false,
    inspectText: "Inspecting: Nothing."
};

class Cell {
    /**
     * A `Cell`, a collection of stuff occupying one screen cell.
     * A `Cell` is a logical grouping and *does not* correspond to a DOM element.
     * It *does* correspond to coordinates on the board grid, however.
     *
     * @param {Array<Piece>} pieces - an initial array of Pieces to put in this cell
     * @param {int} y - the logical (board) y-coordinate of this cell
     * @param {int} x - the logical (board) x-coordinate of this cell
     * @param {Board} board - a reference to the Board that contains this cell
     */
    constructor(y, x, pieces, board) {
        this.y = y;
        this.x = x;
        this.board = board;

        this.pieces = [];
        for (let piece of pieces) {
            this.placePiece(piece);
        }
    }

    get canMoveThrough() {
        for (let piece of this.pieces) {
            if (!piece.canMoveThrough) {
                return false;
            }
        }
        return true;
    }

    get coordinates() {
        return [this.y, this.x];
    }

    /**
     * Place another piece in this cell.
     * This method also sets the piece's `cell` reference to this Cell.
     * @param  {Piece} piece
     */
    placePiece(piece) {
        this.pieces.push(piece);
        piece.visualPos = [this.y, this.x];
        piece.cell = this;
        this.board.element.appendChild(piece.node);
    }

    cheatInspect() {
        return `Inspecting: (${[this.y, this.x]}).
		\nCell contains ${this.pieces.length} pieces: 
		\n\t${this.pieces.join(", ")}
		\nCan be moved through: ${this.canMoveThrough}`;
    }
}

class Board {
    /**
     * A `Board`. Contains `Cell`s and most information that the player can see.
     * This constructor creates a new board of the given width and height.
     *
     * A `Board` stores its `Cell`s in a two-dimensional array, and does not contain
     * direct references to DOM elements except its own.
     *
     * @param  {int} height
     * @param  {int} width
     * @param  {HTMLElement} element - the HTML element associated with the board.
     */
    constructor(height, width, element) {
        this.height = height;
        this.width = width;
        this.cells = [];
        this.element = element;

        // Make a bunch of '.' ground/placeholder elements
        // and initialize our Cells with them.
        let fragment = document.createDocumentFragment();
        for (let row = 0; row < height; row++) {
            this.cells.push([]);
            for (let col = 0; col < width; col++) {
                const node = Piece.dotElement();
                fragment.appendChild(node);
                // this.element.appendChild(node); // bad bad

                const piece = new Piece(node, '.');
                this.cells[row].push(new Cell(row, col, [piece], this));
            }
        }
        this.element.appendChild(fragment);
    }

    get randomCoords() {
        const y = Math.floor(Math.random() * this.height);
        const x = Math.floor(Math.random() * this.width);
        return [y, x];
    }

    // TODO: multi-board cell getter-y stuff

    cellInBounds(y, x) {
        // Support passing in coordinates as arrays
        if (Array.isArray(y)) {
            x = y[1];
            y = y[0];
        }
        // messageLog.log(this.height, this.width);
        return (y < this.height && y >= 0) && (x < this.width && x >= 0);
    }

    cellAt(y, x) {
        // Support passing in coordinates as arrays
        if (Array.isArray(y)) {
            x = y[1];
            y = y[0];
        }
        // if cell is OOB, just return null (for now)
        if (this.cellInBounds(y, x)) {
            return this.cells[y][x];
        }
        return null;
    }
}

class Piece {
    /**
     * A game piece. Lives on a `Board`.
     * @param {HTMLElement} node - the DOM node that represents this piece
     * @param {String} char - a one-character string that represents this piece. Later will add styles.
     */
    constructor(node, char) {
        this.node = node;
        this.char = char;
        this.node.classList.add("pc");
        this.node.textContent = char;
    }

    get canMoveThrough() {
        return true;
    }

    // Game position getters + setters
    // TODO: should error while piece is not in a cell (just in case)
    get y() {
        return this.cell.y;
    }

    set y(newY) {
        // Splice ourselves out of our current cell.
        this.cell.pieces.splice(this.cell.pieces.indexOf(this), 1);
        // Set our cell to the cell an offset, thataway
        this.cell = this.cell.board.cellAt(newY, this.cell.x);
        // Graft ourselves onto our new cell
        this.cell.pieces.push(this);
        this.syncVisualPosition(); // after every logical position change, sync.
    }

    get x() {
        return this.cell.x;
    }

    set x(newX) {
        // Splice ourselves out of our current cell
        this.cell.pieces.splice(this.cell.pieces.indexOf(this), 1);
        // Set our cell to the cell an offset, thataway
        this.cell = this.cell.board.cellAt(this.cell.y, newX);
        // Graft ourselves onto our new cell
        this.cell.pieces.push(this);
        this.syncVisualPosition(); // changed, so sync.
    }

    get pos() {
        return [this.y, this.x];
    }

    set pos(newPos) {
        this.y = newPos[0];
        this.x = newPos[1];
    }

    // TODO: maybe remove pointless getset pair?
    get board() {
        return this.cell.board;
    }

    set board(newBoard) {
        this.cell.board = newBoard;
    }

    // Visual position getters + setters

    get visualGridPos() {
        return [this._gridY, this._gridX];
    }

    // Set/retrieve the "raw" grid/visual position, in terms of CSS Grid track starts (1-indexed)
    set visualGridPos(pos) {
        this._gridY = pos[0];
        this._gridX = pos[1];
        this.updatePositionStyle();
    }

    get visualPos() {
        return [this._gridY - 1, this._gridX - 1];
    }

    // Set/retrieve the "cooked" grid/visual position, in terms of game cells (0-indexed)
    set visualPos(pos) {
        this._gridY = pos[0] + 1;
        this._gridX = pos[1] + 1;
        this.updatePositionStyle();
    }

    static dotElement() {
        const dot = document.createElement("span");
        dot.textContent = ".";
        dot.classList.add("muted", "pc-dot");
        return dot;
    }

    static gameCoordsOf(node) {
        return [node.style.getPropertyValue("grid-row") - 1, node.style.getPropertyValue("grid-column") - 1];
    }

    // Update the `node`'s style based on Piece state
    updatePositionStyle() {
        this.node.style.setProperty("grid-row", this._gridY);
        this.node.style.setProperty("grid-column", this._gridX);
    }

    // Update the visual position to match the game position
    syncVisualPosition() {
        this.visualPos = [this.y, this.x];
    }

    /**
     * @return {String} a string representation of this piece.
     */
    toString() {
        return this.constructor.name;
    }
}

class PlayerPiece extends Piece {
    constructor() {
        const node = document.createElement("span");
        super(node, "@");
        this.node.classList.add("pc-player");
    }

    get canMoveThrough() {
        return true;
    }

    /**
     * @param  {Array<int>} direction - relative direction coordinates, `[y, x]`.
     *                                    +Y is down, +X is right.
     */
    tryMove(direction) {
        let newPosition = [this.y + direction[0], this.x + direction[1]];

        // OOB movement prohibited (for now)
        // console.debug("Moving to: " + newPosition);
        if (!this.cell.board.cellInBounds(newPosition)) {
            messageLog.log(`You can't move there.`);
            messageLog.amend(` @(${this.cell.coordinates})`);
            return false;
        }

        if (!this.cell.board.cellAt(newPosition).canMoveThrough) {
            messageLog.log("A solid object blocks the way.");
            messageLog.amend(` @(${this.cell.coordinates})`);
            return false;
        }

        this.pos = newPosition;
        // messageLog.log(this.cell.coordinates);

        return true;
    }
}

class WallPiece extends Piece {
    constructor() {
        const node = document.createElement("span");
        super(node, "#");
        this.node.classList.add("pc-wall");
    }

    get canMoveThrough() {
        return false;
    }
}

// Set up the board for testing

function initBoard() {
    cB = new Board(boardHeight, boardWidth, boardElement);

    playerPiece = new PlayerPiece();

    // const coords = cB.randomCoords;
    const coords = [1, 2];

    messageLog.log("placing player at: " + coords);
    cB.cellAt(...coords).placePiece(playerPiece);
}

// Some DOM code

/**
 * Hide a DOM element, setting its `hidden` attribute.
 * If the node is not an `HTMLElement`, and is, for example a `Text` node, do nothing.
 * @param {HTMLElement} node
 * @param {Object?} options {force:true} will always hide the object, even if it isn't an HTMLElement.
 */
function hide(node, options) {
    if (!(node instanceof HTMLElement) && !(options.force)) {
        // hid a Text node, etc.
        return;
    }
    node.classList.add("hidden")
    node.setAttribute("hidden", "");
}

/**
 * Show a DOM element, removing its `hidden` attribute
 * If the node is not an `HTMLElement`, and is, for example a `Text` node, do nothing.
 * @param  {HTMLElement} node
 */
function show(node) {
    if (!(node instanceof HTMLElement)) {
        // hid a Text node, etc.
        return;
    }
    node.classList.remove("hidden")
    node.hidden = false;
}

// TODO: factor out the wish menu into a `WishMenu` class

/**
 * Wish function: activate cheats by name. For testy testing.
 * @param  {String} wish - what to make come true
 * @return {Boolean} true if the wish was found in the list, false if it was not
 */
function wishFor(wish) {
    switch (wish.trim().toLowerCase()) {
        case "a pony":
            messageLog.log("haha, a pony");
            break;

        case "the footer back":
            messageLog.log("heres ur footer");
            show(footer);
            break;

        case "build":
            cheats.buildMode = !(cheats.buildMode);
            const buildOn = cheats.buildMode ? "on" : "off";
            messageLog.log(`Switched build mode ${buildOn}.`);
            if (cheats.buildMode) {
                messageLog.amend(" Click on a cell to place a wall there.")
            }
            break;
        case "inspect":
            cheats.inspectMode = !(cheats.inspectMode);
            inspectModeStatus.textContent = cheats.inspectText;
            const inspectOn = cheats.inspectMode ? "on" : "off";
            messageLog.log(`Switched inspect mode ${inspectOn}.`);
            if (cheats.inspectMode) {
                show(inspectModeStatus);
                messageLog.amend(" Click on a cell to view the pieces it contains.")
            } else {
                hide(inspectModeStatus);
            }
            break;
        default:
            messageLog.log(`Wish "${wish}" not found.`)
            return false;
    }
    return true;
}

function createWishMenu() {
    const menu = document.createElement("div");
    menu.setAttribute("role", "group"); // a11y maybe
    menu.setAttribute("id", "wish_menu");
    menu.classList.add("wish-menu");

    const label = document.createElement("label");
    label.textContent = "Wish for:";

    const field = document.createElement("input");
    field.placeholder = "a pony";

    const button = document.createElement("button");
    button.textContent = "Wish!";

    field.addEventListener("keydown", e => {
        if (e.key === "Enter" && wishFor(field.value))
            hide(menu);
    })

    button.addEventListener("click", () => {
        if (wishFor(field.value))
            hide(menu);
    });

    menu.appendChild(label);
    menu.appendChild(field);
    menu.appendChild(button);

    hide(menu);
    boardElement.parentElement.appendChild(menu);

    return menu;
}

const wishMenu = createWishMenu();

function ajaxGET(path, callback) {
    // Document is loaded now so go and fetch a resource.
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
        if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
            callback(this.responseText);
        }
    };
    xhr.open("GET", path);
    xhr.send();
}

function ajaxPOST(path, body, callback) {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
        if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
            callback(this.responseText);
            // this won't work ... discuss!!!
            //return this.responseText;
        }
    };
    xhr.open("POST", path);
    xhr.send(body);
}

class Character {
    constructor() {

    }

    /**
     * Return a `Character`, its data loaded from a `Save`.
     * @param {Save} saveData - the `Save` to load from
     * @returns {Character} the Character
     */
    static fromSave(saveData) {
        const character = new Character();

        character.name = saveData.characterName;
        character.class = saveData.characterClass;
        character.level = saveData.characterLevel;
        character.stats = saveData.characterStats;

        return character;
    }

    toString() {
        return `${this.name}, level ${this.level} ${capitalize(this.class)}`
    }

}

function capitalize(string) {
    return string[0].toUpperCase() + string.substring(1);
}

class World {
    constructor() {
        this.boards = [];
    }

    addBoard(board) {
        this.boards.push(board);
    }
}

class Save {
    /**
     * Represents a save file.
     *  @param {XMLDocument} doc - the information, in XML format, that will populate this save.
     */
    constructor() {

    }

    /**
     * Use the supplied `doc` to construct a `Save`.
     * @param {Document} doc - the information, in XML format, that will populate this save.
     * @return {Save} the `Save`.
     */
    static fromDocument(doc) {
        const save = new Save();
        save.doc = doc;

        save.characterLevel = save.readNumberProperty("savegame/character/@level");
        save.characterName = save.readStringProperty("savegame/character/name");
        save.characterClass = save.readStringProperty("savegame/character/@class");

        save.characterStats = save.readAttributes();
        return save;
    }

    /**
     * Use the currently-loaded `currentWorld` and `currentCharacter` values to construct a `Save`.
     * @return {Save} the `Save`.
     */
    static fromCurrent() {
        // TODO: write the `Save.fromCurrent` method.
        const save = new Save()

        save.characterName = currentCharacter.name;
        save.characterLevel = currentCharacter.level;
        save.characterClass = currentCharacter.class;

        save.world = currentWorld;

        return save;
    }

    /**
     * Turn this `Save` object into an XMLDocument.
     * @return {Document} the document.
     */
    serialize() {
        //TODO: write the `save.serialize` method.
        return new Document();
    }

    readStringProperty(query) {
        return this.doc.evaluate(query, this.doc, null, XPathResult.STRING_TYPE).stringValue;
    }

    readNumberProperty(query) {
        return this.doc.evaluate(query, this.doc, null, XPathResult.NUMBER_TYPE).numberValue;
    }

    /**
     *  Pretty-print a brief description of this save.
     *  E.g: “Nagawur, level 16 Warrior.”
     *  @return {string}
     */
    toString() {
        return `${this.characterName}, level ${this.characterLevel} 
       ${capitalize(this.characterClass)}.`;
    }

    /**
     * Return a save listing element, fit to put into an <ol> element of saves.
     * @returns {HTMLElement}
     */
    getListing() {
        const element = document.createElement("li");
        const inner = document.createElement("button");
        inner.textContent = this.toString();
        inner.setAttribute("tabindex", "0");
        inner.classList.add("subtle");

        element.append(inner);
        return element;
    }

    /**
     * Return a <table> element, summarizing details about this save file.
     */
    getTable() {
        // Get the <table> element out of the document
        const table = document.importNode(
            this.doc
                .evaluate("savegame/character/stats/table", this.doc)
                .iterateNext(),
            true);

        // Add some colours to the bonus column.
        for (let bonusElement of table.querySelectorAll('td[title=bonus]')) {
            if (parseInt(bonusElement.textContent) > 0) {
                bonusElement.classList.add("positive-bonus")
            }
            if (parseInt(bonusElement.textContent) < 0) {
                bonusElement.classList.add("negative-bonus")
            }
        }

        // Hide purely internal columns.
        for (let codeElement of table.querySelectorAll('td[title=codename]')) {
            // console.log(codeElement instanceof HTMLElement)
            hide(codeElement, {force:true})
        }

        return table;
    }

    /**
     * Read the character attributes from this `Save`'s internal document (`this.doc`) and return an object containing
     * key-value pairs of form `{codename: [score, bonus]}` where `codename` is a string value, and `score` and `bonus`
     * are number values.
     * @returns {Object} the attributes
     */
    readAttributes() {

        const attrs = {};

        for (let row of this.getTable().childNodes) {
            // tuple of (codename, [score, bonus])
            // placeholder values
            let entry = ["!#NAME", [-999, -999]];
            for (let col of row.childNodes) {
                switch (col.title) {
                    case "score":
                        entry[1][0] = parseInt(col.textContent);
                        break;
                    case "bonus":
                        entry[1][1] = parseInt(col.textContent);
                        break;
                    case "codename":
                        entry[0] = col.textContent;
                        break;
                }
            }
            attrs[entry[0]] = entry[1]
        }

        return attrs;
    }
}

// Our `main` function, sets up the document with some event listeners and elements.
function initDoc() {
    mainMenu.show();

    // Hide the footer if the user asks us to:
    hideFooterButton.addEventListener("click", (event) => {
        hide(footer);
        // footer.childNodes.forEach(hide);
    });

    // Detect all clicks on the game board
    boardElement.addEventListener('click', function (event) {

        // If the click happened inside a piece span, and build mode is on
        let closestPieceElement = event.target.closest('.pc');
        if (closestPieceElement && cheats.buildMode) {
            // messageLog.log(closestPieceElement);
            // messageLog.log("trying to place a wall at " + Piece.gameCoordsOf(closestPieceElement));
            cB.cellAt(Piece.gameCoordsOf(closestPieceElement)).placePiece(new WallPiece());
        }

        if (closestPieceElement && cheats.inspectMode) {
            cheats.inspectText = cB.cellAt(Piece.gameCoordsOf(closestPieceElement)).cheatInspect();
            inspectModeStatus.textContent = cheats.inspectText;
        }

    }, false);
    // #endregion

    // Capture key events globally
    document.body.addEventListener("keydown", (event) => {
        // Don't capture when in textfields, etc.
        if (document.activeElement instanceof HTMLInputElement)
            return;

        switch (event.key) {
            // Movement commands.
            // Left:
            case "h":
                playerPiece.tryMove([0, -1]);
                break;
            // Right:
            case "l":
                playerPiece.tryMove([0, 1]);
                break;
            // Up:
            case "j":
                playerPiece.tryMove([-1, 0]);
                break;
            // Down:
            case "k":
                playerPiece.tryMove([1, 0]);
                break;
            // Wishes and dev cheats
            case "w":
                messageLog.log("Wishing…");
                show(wishMenu);
                break;
            case "i":
                wishFor("inspect");
                break;
            case "b":
                wishFor("build");
                break;
            // Save/load menu
            case "o":
                messageLog.log("Opening “Open Save” menu")
                savesMenu.show();
                break;
            case "s":
                messageLog.log("Opening “Save Game” menu")
                saveGameMenu.show()
                break;
            // TODO: Character menu
            case "x":
                messageLog.log("opening character menu")
                characterMenu.show();
                break;
            case "Escape":
                messageLog.log("Opening Main Menu")
                mainMenu.show();
                break;
            case "?":
                // hide(document.getElementById("intro-message"))
                show(document.getElementById("controls-message"));
                break;
            default:
                console.log(event.key);
                break;

        }
    }, {passive: true, capture: true});
    initBoard();
}

initDoc();