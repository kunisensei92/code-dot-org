import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom';
import Hammer from 'hammerjs';

import trackEvent from '../../util/trackEvent';
import { trySetLocalStorage } from '../../utils';
import { singleton as studioApp } from '../../StudioApp';
import craftMsg from './locale';
import CustomMarshalingInterpreter from '../../lib/tools/jsinterpreter/CustomMarshalingInterpreter';
import GameController from '@code-dot-org/craft/src/js/game/GameController';
import FacingDirection from '@code-dot-org/craft/src/js/game/LevelMVC/FacingDirection';
import EventType from '@code-dot-org/craft/src/js/game/Event/EventType';
import { convertActionPlaneEntitiesToConfig } from '@code-dot-org/craft/src/js/game/LevelMVC/Utils';
import dom from '../../dom';
import MusicController from '../../MusicController';
import { Provider } from 'react-redux';
import AppView from '../../templates/AppView';
import CraftVisualizationColumn from './CraftVisualizationColumn';
import { getStore } from '../../redux';
import Sounds from '../../Sounds';

import { TestResults } from '../../constants';

const MEDIA_URL = '/blockly/media/craft/';

const ArrowIds = {
  LEFT: 'leftButton',
  UP: 'upButton',
  RIGHT: 'rightButton',
  DOWN: 'downButton',
};

const interfaceImages = {
  DEFAULT: [
    MEDIA_URL + 'Sliced_Parts/MC_Loading_Spinner.gif',
    MEDIA_URL + 'Sliced_Parts/Frame_Large_Plus_Logo.png',
    MEDIA_URL + 'Sliced_Parts/Pop_Up_Slice.png',
    MEDIA_URL + 'Sliced_Parts/X_Button.png',
    MEDIA_URL + 'Sliced_Parts/Button_Grey_Slice.png',
    MEDIA_URL + 'Sliced_Parts/Run_Button_Up_Slice.png',
    MEDIA_URL + 'Sliced_Parts/MC_Run_Arrow_Icon_Smaller.png',
    MEDIA_URL + 'Sliced_Parts/Run_Button_Down_Slice.png',
    MEDIA_URL + 'Sliced_Parts/Reset_Button_Up_Slice.png',
    MEDIA_URL + 'Sliced_Parts/MC_Reset_Arrow_Icon.png',
    MEDIA_URL + 'Sliced_Parts/Reset_Button_Down_Slice.png',
    MEDIA_URL + 'Sliced_Parts/Callout_Tail.png',
  ],
  1: [
    MEDIA_URL + 'Sliced_Parts/Steve_Character_Select.png',
    MEDIA_URL + 'Sliced_Parts/Alex_Character_Select.png',
    MEDIA_URL + 'Sliced_Parts/Agent_Fail.png',
    MEDIA_URL + 'Sliced_Parts/Agent_Neutral.png',
    MEDIA_URL + 'Sliced_Parts/Agent_Success.png',
  ],
};

const MUSIC_METADATA = [
  { volume: 1, hasOgg: true, name: 'vignette1' },
  { volume: 1, hasOgg: true, name: 'vignette2-quiet' },
  { volume: 1, hasOgg: true, name: 'vignette3' },
  { volume: 1, hasOgg: true, name: 'vignette4-intro' },
  { volume: 1, hasOgg: true, name: 'vignette5-shortpiano' },
  { volume: 1, hasOgg: true, name: 'vignette7-funky-chirps-short' },
  { volume: 1, hasOgg: true, name: 'vignette8-free-play' },
];

const CHARACTER_STEVE = 'Steve';
const CHARACTER_ALEX = 'Alex';
const DEFAULT_CHARACTER = CHARACTER_STEVE;

const directionToFacing = {
  upButton: FacingDirection.North,
  downButton: FacingDirection.South,
  leftButton: FacingDirection.West,
  rightButton: FacingDirection.East,
};

export default class Craft {
  /**
   * Initialize Blockly and the Craft app. Called on page load.
   */
  static init(config) {
    if (config.level.puzzle_number === 1 && config.level.stage_total === 1) {
      // Not viewing level within a script, bump puzzle # to unused one so
      // asset loading system and levelbuilder overrides don't think this is
      // level 1 or any other special level.
      config.level.puzzle_number = 999;
    }

    if (config.level.isTestLevel) {
      config.level.customSlowMotion = 0.1;
    }

    config.level.disableFinalStageMessage = true;
    config.showInstructionsInTopPane = true;

    // Return the version of Internet Explorer (8+) or undefined if not IE.
    const getIEVersion = function () {
      return document.documentMode;
    };

    const ieVersionNumber = getIEVersion();
    if (ieVersionNumber) {
      $('body').addClass('ieVersion' + ieVersionNumber);
    }

    if (config.level.isAgentLevel) {
      $('body').addClass('minecraft-agent');
    }

    const bodyElement = document.body;
    bodyElement.className = bodyElement.className + ' minecraft';

    // Always add a hook for after the video but before the level proper begins.
    // Use this to start music, and sometimes to show an extra dialog.
    config.level.afterVideoBeforeInstructionsFn = (showInstructions) => {
      Craft.beginBackgroundMusic();
      if (config.level.showPopupOnLoad) {
        if (config.level.showPopupOnLoad === 'playerSelection') {
          Craft.showPlayerSelectionPopup(function (selectedPlayer) {
            trackEvent('Minecraft', 'ChoseCharacter', selectedPlayer);
            Craft.clearPlayerState();
            trySetLocalStorage('craftSelectedPlayer', selectedPlayer);
            Craft.initializeAppLevel(config.level);
            showInstructions();
          });
        }
      } else {
        showInstructions();
      }
    };

    Craft.initialConfig = config;

    // replace studioApp() methods with our own
    studioApp().reset = Craft.reset.bind(Craft);
    studioApp().runButtonClick = Craft.runButtonClick.bind(Craft);

    Craft.level = config.level;
    Craft.skin = config.skin;

    let levelTracks = [];
    if (Craft.level.songs && MUSIC_METADATA) {
      levelTracks = MUSIC_METADATA.filter(function (trackMetadata) {
        return Craft.level.songs.indexOf(trackMetadata.name) !== -1;
      });
    }

    Craft.musicController = new MusicController(
      Sounds.getSingleton(),
      function (filename) {
        return config.skin.assetUrl(`music/${filename}`);
      },
      levelTracks,
      levelTracks.length > 1 ? 7500 : null,
    );

    config.skin.staticAvatar = MEDIA_URL + 'Sliced_Parts/Agent_Neutral.png';
    config.skin.smallStaticAvatar = MEDIA_URL + 'Sliced_Parts/Agent_Neutral.png';
    config.skin.failureAvatar = MEDIA_URL + 'Sliced_Parts/Agent_Fail.png';
    config.skin.winAvatar = MEDIA_URL + 'Sliced_Parts/Agent_Success.png';

    const onMount = function () {
      studioApp().init(
        Object.assign({}, config, {
          forceInsertTopBlock: 'when_run',
          appStrings: {
            generatedCodeDescription: craftMsg.generatedCodeDescription(),
          },
          loadAudio: function () {},
          afterInject: function () {
            if (config.level.showMovementBanner) {
              studioApp().displayWorkspaceAlert(
                'warning',
                <div>
                  {craftMsg.useArrowKeys()}
                </div>,
              );
            }

            // NaN if not set
            const slowMotionURLParam = parseFloat(
              (location.search.split('customSlowMotion=')[1] || '')
                .split('&')[0],
            );
            Craft.gameController = new GameController({
              Phaser: window.Phaser,
              containerId: 'phaser-game',
              assetRoot: Craft.skin.assetUrl(''),
              audioPlayer: {
                register: studioApp().registerAudio.bind(studioApp()),
                play: studioApp().playAudio.bind(studioApp()),
              },
              debug: false,
              customSlowMotion: config.level.isTestLevel
                ? 0.5
                : slowMotionURLParam,
              /**
             * First asset packs to load while video playing, etc.
             * Won't matter for levels without delayed level initialization
             * (due to e.g. character / house select popups).
             */
              earlyLoadAssetPacks: Craft.earlyLoadAssetsForLevel(
                config.level.puzzle_number,
              ),
              afterAssetsLoaded: function () {
                // preload music after essential game asset downloads completely finished
                Craft.musicController.preload();
              },
              earlyLoadNiceToHaveAssetPacks: Craft.niceToHaveAssetsForLevel(
                config.level.puzzle_number,
              ),
            });

            if (!config.level.showPopupOnLoad) {
              Craft.initializeAppLevel(config.level);
            }

            if (studioApp().hideSource) {
              // Set visualizationColumn width in share mode so it can be centered
              const visualizationColumn = document.getElementById(
                'visualizationColumn',
              );
              visualizationColumn.style.width = this.nativeVizWidth + 'px';
            }

            for (const btn in ArrowIds) {
              dom.addMouseUpTouchEvent(
                document.getElementById(ArrowIds[btn]),
                (function (btn) {
                  return () => {
                    Craft.onArrowButtonUp(ArrowIds[btn]);
                  };
                })(btn),
              );
              dom.addMouseDownTouchEvent(
                document.getElementById(ArrowIds[btn]),
                (function (btn) {
                  return e => {
                    Craft.onArrowButtonDown(e, ArrowIds[btn]);
                  };
                })(btn),
              );
            }

            dom.addMouseUpTouchEvent(document, Craft.onDocumentMouseUp, false);
            $('#soft-buttons')
              .removeClass('soft-buttons-none')
              .addClass('soft-buttons-' + 4);
            Craft.hideSoftButtons();

            const phaserGame = document.getElementById('phaser-game');
            const onDrag = function (e) {
              const hammerToButton = {
                [Hammer.DIRECTION_LEFT]: 'leftButton',
                [Hammer.DIRECTION_RIGHT]: 'rightButton',
                [Hammer.DIRECTION_UP]: 'upButton',
                [Hammer.DIRECTION_DOWN]: 'downButton',
              };
              if (hammerToButton[e.direction]) {
                Craft.gameController.codeOrgAPI.arrowDown(
                  directionToFacing[hammerToButton[e.direction]],
                );
              }
              e.preventDefault();
            };

            const mc = new Hammer.Manager(phaserGame);
            mc.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL }));
            mc.add(new Hammer.Press({ time: 150 }));
            mc.add(new Hammer.Tap());
            mc.on('pan', onDrag);
            mc.on('press', () =>
              Craft.gameController.codeOrgAPI.clickDown(() => {}),
            );
            mc.on('tap', () => {
              Craft.gameController.codeOrgAPI.clickDown(() => {});
              Craft.gameController.codeOrgAPI.clickUp(() => {});
            });
            mc.on('pressup', () =>
              Craft.gameController.codeOrgAPI.clickUp(() => {}),
            );
          },
          twitter: {
            text: 'Share on Twitter',
            hashtag: 'Craft',
          },
        }),
      );

      let interfaceImagesToLoad = [];
      interfaceImagesToLoad = interfaceImagesToLoad.concat(
        interfaceImages.DEFAULT,
      );

      if (
        config.level.puzzle_number &&
        interfaceImages[config.level.puzzle_number]
      ) {
        interfaceImagesToLoad = interfaceImagesToLoad.concat(
          interfaceImages[config.level.puzzle_number],
        );
      }

      interfaceImagesToLoad.forEach(function (url) {
        const img = new Image();
        img.src = url;
      });

      const shareButton = $('.mc-share-button');
      if (shareButton.length) {
        dom.addClickTouchEvent(shareButton[0], function () {
          Craft.reportResult(true);
        });
      }
    };

    // Push initial level properties into the Redux store
    studioApp().setPageConstants(config, {
      isMinecraft: true,
    });

    ReactDOM.render(
      <Provider store={getStore()}>
        <AppView
          visualizationColumn={
            <CraftVisualizationColumn
              showFinishButton={!config.level.isProjectLevel}
            />
          }
          onMount={onMount}
        />
      </Provider>,
      document.getElementById(config.containerId),
    );
  }

  /**
   * Play music when the instructions are shown
   */
  static beginBackgroundMusic() {
    Sounds.getSingleton().whenAudioUnlocked(function () {
      const hasSongInLevel = Craft.level.songs && Craft.level.songs.length > 1;
      const songToPlayFirst = hasSongInLevel ? Craft.level.songs[0] : null;
      Craft.musicController.play(songToPlayFirst);
    });
  }

  static onArrowButtonDown(e, btn) {
    Craft.gameController.codeOrgAPI.arrowDown(directionToFacing[btn]);
    e.preventDefault(); // Stop normal events so we see mouseup later.
  }

  static onArrowButtonUp(btn) {
    Craft.gameController.codeOrgAPI.arrowUp(directionToFacing[btn]);
  }

  static onDocumentMouseUp() {
    if (!Craft.phaserLoaded() || !Craft.levelInitialized()) {
      return;
    }

    for (const direction in directionToFacing) {
      Craft.gameController.codeOrgAPI.arrowUp(directionToFacing[direction]);
    }
  }

  static characterAssetPackName(playerName) {
    return 'player' + playerName;
  }

  static getCurrentCharacter() {
    return (
      window.localStorage.getItem('craftSelectedPlayer') || DEFAULT_CHARACTER
    );
  }

  static showPlayerSelectionPopup(onSelectedCallback) {
    let selectedPlayer = DEFAULT_CHARACTER;
    const popupDiv = document.createElement('div');
    popupDiv.innerHTML = require('./dialogs/playerSelection.html.ejs')({
      image: studioApp().assetUrl(),
    });
    const popupDialog = studioApp().createModalDialog({
      contentDiv: popupDiv,
      defaultBtnSelector: '#choose-steve',
      onHidden: function () {
        onSelectedCallback(selectedPlayer);
      },
      id: 'craft-popup-player-selection',
    });
    dom.addClickTouchEvent($('#close-character-select')[0], () => {
      popupDialog.hide();
    });
    dom.addClickTouchEvent($('#choose-steve')[0], () => {
      selectedPlayer = CHARACTER_STEVE;
      trackEvent('MinecraftAgent', 'ClickedCharacter', selectedPlayer);
      popupDialog.hide();
    });
    dom.addClickTouchEvent($('#choose-alex')[0], () => {
      selectedPlayer = CHARACTER_ALEX;
      trackEvent('MinecraftAgent', 'ClickedCharacter', selectedPlayer);
      popupDialog.hide();
    });
    popupDialog.show();
  }

  static clearPlayerState() {
    window.localStorage.removeItem('craftSelectedPlayer');
  }

  static initializeAppLevel(levelConfig) {
    convertActionPlaneEntitiesToConfig(levelConfig);

    const fluffPlane = [];
    // TODO(bjordan): remove configuration requirement in visualization
    for (let i = 0; i < (levelConfig.gridWidth || 10) * (levelConfig.gridHeight || 10); i++) {
      fluffPlane.push('');
    }

    const levelAssetPacks = {
      beforeLoad: Craft.minAssetsForLevelWithCharacter(
        levelConfig.puzzle_number,
      ),
      afterLoad: Craft.afterLoadAssetsForLevel(levelConfig.puzzle_number),
    };

    Craft.gameController.loadLevel({
      isDaytime: levelConfig.isDaytime,
      groundPlane: levelConfig.groundPlane,
      groundDecorationPlane: levelConfig.groundDecorationPlane,
      actionPlane: levelConfig.actionPlane,
      fluffPlane: fluffPlane,
      entities: levelConfig.entities,
      useAgent: !!levelConfig.agentStartPosition,
      usePlayer: !!levelConfig.playerStartPosition,
      playerStartPosition: levelConfig.playerStartPosition,
      playerStartDirection: levelConfig.playerStartDirection,
      agentStartPosition: levelConfig.agentStartPosition,
      agentStartDirection: levelConfig.agentStartDirection,
      playerName: Craft.getCurrentCharacter(),
      assetPacks: levelAssetPacks,
      specialLevelType: levelConfig.specialLevelType,
      isAgentLevel: levelConfig.isAgentLevel,
      gridDimensions:
        levelConfig.gridWidth && levelConfig.gridHeight
          ? [levelConfig.gridWidth, levelConfig.gridHeight]
          : null,
      levelVerificationTimeout: levelConfig.levelVerificationTimeout,
      // eslint-disable-next-line no-eval
      verificationFunction: eval('[' + levelConfig.verificationFunction + ']')[0], // TODO(bjordan): add to utils
      // eslint-disable-next-line no-eval
      failureCheckFunction: eval('[' + levelConfig.failureCheckFunction + ']')[0], // TODO(bjordan): add to utils
      // eslint-disable-next-line no-eval
      timeoutResult: eval('[' + (levelConfig.timeoutVerificationFunction || `function() { return false; }`) + ']')[0],
    });
  }

  static minAssetsForLevelWithCharacter(levelNumber) {
    return Craft.minAssetsForLevelNumber(levelNumber).concat([
      Craft.characterAssetPackName(Craft.getCurrentCharacter()),
    ]);
  }

  static minAssetsForLevelNumber(levelNumber) {
    switch (levelNumber) {
      default:
        return ['allAssetsMinusPlayer', 'playerAgent'];
    }
  }

  static afterLoadAssetsForLevel(levelNumber) {
    // After level loads & player starts playing, kick off further asset downloads
    switch (levelNumber) {
      default:
        // May want to push this to occur on level with video
        return ['allAssetsMinusPlayer', 'playerAgent'];
    }
  }

  static earlyLoadAssetsForLevel(levelNumber) {
    switch (levelNumber) {
      default:
        return Craft.minAssetsForLevelWithCharacter(levelNumber);
    }
  }

  static niceToHaveAssetsForLevel(levelNumber) {
    switch (levelNumber) {
      case 1:
        return ['playerSteve', 'playerAlex'];
      default:
        return ['allAssetsMinusPlayer'];
    }
  }

  /** Folds array B on top of array A */
  static foldInArray(arrayA, arrayB) {
    for (let i = 0; i < arrayA.length; i++) {
      if (arrayB[i] !== '') {
        arrayA[i] = arrayB[i];
      }
    }
  }

  static hideSoftButtons() {
    $('#soft-buttons').hide();
    studioApp().resizePinnedBelowVisualizationArea();
  }

  static showSoftButtons() {
    $('#soft-buttons').show();
    studioApp().resizePinnedBelowVisualizationArea();
  }

  /**
   * Reset the app to the start position and kill any pending animation tasks.
   * @param {boolean} first true if first reset
   */
  static reset(first) {
    if (first) {
      return;
    }
    if (Craft.level.usePlayer) {
      Craft.hideSoftButtons();
    }
    Craft.gameController.codeOrgAPI.resetAttempt();
  }

  static phaserLoaded() {
    return (
      Craft.gameController &&
      Craft.gameController.game &&
      Craft.gameController.game.load &&
      !Craft.gameController.game.load.isLoading
    );
  }

  static levelInitialized() {
    return Craft.gameController && Craft.gameController.levelModel;
  }

  /**
   * Click the run button.  Start the program.
   */
  static runButtonClick() {
    if (!Craft.phaserLoaded()) {
      return;
    }

    if (Craft.level.usePlayer) {
      Craft.showSoftButtons();
    }

    const runButton = document.getElementById('runButton');
    const resetButton = document.getElementById('resetButton');

    // Ensure that Reset button is at least as wide as Run button.
    if (!resetButton.style.minWidth) {
      resetButton.style.minWidth = runButton.offsetWidth + 'px';
    }

    studioApp().toggleRunReset('reset');
    Blockly.mainBlockSpace.traceOn(true);
    studioApp().attempts++;

    Craft.executeUserCode();

    if (Craft.level.freePlay && !studioApp().hideSource) {
      const finishBtnContainer = $('#right-button-cell');

      if (
        finishBtnContainer.length &&
        !finishBtnContainer.hasClass('right-button-cell-enabled')
      ) {
        finishBtnContainer.addClass('right-button-cell-enabled');
        studioApp().onResize();

        const event = document.createEvent('Event');
        event.initEvent('finishButtonShown', true, true);
        document.dispatchEvent(event);
      }
    }
  }

  static executeUserCode() {
    if (Craft.initialConfig.level.edit_blocks) {
      Craft.reportResult(true);
      return;
    }

    if (studioApp().hasUnwantedExtraTopBlocks()) {
      // immediately check answer instead of executing, which will fail and
      // report top level blocks (rather than executing them)
      Craft.reportResult(false);
      return;
    }

    studioApp().playAudio('start');

    // Start tracing calls.
    Blockly.mainBlockSpace.traceOn(true);

    const appCodeOrgAPI = Craft.gameController.codeOrgAPI;
    appCodeOrgAPI.startCommandCollection();
    appCodeOrgAPI.registerEventCallback(null, event => {
      if (
        event.eventType === EventType.WhenUsed &&
        event.targetType === 'sheep'
      ) {
        appCodeOrgAPI.drop(null, 'wool', event.targetIdentifier);
      }
      if (
        event.eventType === EventType.WhenTouched &&
        event.targetType === 'creeper'
      ) {
        appCodeOrgAPI.flashEntity(null, event.targetIdentifier);
        appCodeOrgAPI.explodeEntity(null, event.targetIdentifier);
      }
    });

    // Run user generated code, calling appCodeOrgAPI
    let code = '';
    let codeBlocks = Blockly.mainBlockSpace.getTopBlocks(true);
    if (studioApp().initializationBlocks) {
      codeBlocks = studioApp().initializationBlocks.concat(codeBlocks);
    }

    code = Blockly.Generator.blocksToCode('JavaScript', codeBlocks);
    CustomMarshalingInterpreter.evalWith(code, {
      moveForward: function (blockID) {
        appCodeOrgAPI.moveForward(studioApp().highlight.bind(studioApp(), blockID), 'PlayerAgent');
      },
      moveBackward: function (blockID) {
        appCodeOrgAPI.moveBackward(studioApp().highlight.bind(studioApp(), blockID), 'PlayerAgent');
      },
      turnLeft: function (blockID) {
        appCodeOrgAPI.turnLeft(studioApp().highlight.bind(studioApp(), blockID), 'PlayerAgent');
      },
      turnRight: function (blockID) {
        appCodeOrgAPI.turnRight(studioApp().highlight.bind(studioApp(), blockID), 'PlayerAgent');
      },
      destroyBlock: function (blockID) {
        appCodeOrgAPI.destroyBlock(studioApp().highlight.bind(studioApp(), blockID), 'PlayerAgent');
      },
      whilePathAhead: function (blockID, callback) {
        // if resurrected, move blockID be last parameter to fix "Show Code"
        appCodeOrgAPI.whilePathAhead(studioApp().highlight.bind(studioApp(), blockID),
            '',
            'PlayerAgent',
            callback);
      },
      whileBlockAhead: function (blockID, blockType, callback) {
        // if resurrected, move blockID be last parameter to fix "Show Code"
        appCodeOrgAPI.whilePathAhead(studioApp().highlight.bind(studioApp(), blockID),
            blockType,
            'PlayerAgent',
            callback);
      },
      ifLavaAhead: function (callback, blockID) {
        // if resurrected, move blockID be last parameter to fix "Show Code"
        appCodeOrgAPI.ifBlockAhead(studioApp().highlight.bind(studioApp(), blockID),
            "lava",
            'PlayerAgent',
            callback);
      },
      ifBlockAhead: function (blockType, callback, blockID) {
        appCodeOrgAPI.ifBlockAhead(studioApp().highlight.bind(studioApp(), blockID),
            blockType,
            'PlayerAgent',
            callback);
      },
      placeBlock: function (blockType, blockID) {
        appCodeOrgAPI.placeBlock(studioApp().highlight.bind(studioApp(), blockID),
          blockType,
          'PlayerAgent');
      },
      moveDirection: function (direction, targetEntity, blockID) {
        const dirStringToDirection = {
          up: FacingDirection.North,
          down: FacingDirection.South,
          left: FacingDirection.West,
          right: FacingDirection.East,
        };
        appCodeOrgAPI.moveDirection(studioApp().highlight.bind(studioApp(), blockID),
            dirStringToDirection[direction], targetEntity);
      },
    }, {legacy: true});

    appCodeOrgAPI.startAttempt((success, levelModel) => {
      Craft.hideSoftButtons();
      if (Craft.level.freePlay) {
        return;
      }
      Craft.reportResult(success);
    });
  }

  static getTestResultFrom(success, studioTestResults) {
    if (studioTestResults === TestResults.LEVEL_INCOMPLETE_FAIL) {
      return TestResults.APP_SPECIFIC_FAIL;
    }

    if (Craft.initialConfig.level.freePlay) {
      return TestResults.FREE_PLAY;
    }

    return studioTestResults;
  }

  static reportResult(success) {
    const studioTestResults = studioApp().getTestResults(success);
    const testResultType = Craft.getTestResultFrom(success, studioTestResults);

    const image = Craft.initialConfig.level.freePlay
      ? Craft.gameController.getScreenshot()
      : null;
    // Grab the encoded image, stripping out the metadata, e.g. `data:image/png;base64,`
    const encodedImage = image ? encodeURIComponent(image.split(',')[1]) : null;

    studioApp().report({
      app: 'craft',
      level: Craft.initialConfig.level.id,
      result: Craft.initialConfig.level.freePlay ? true : success,
      testResult: testResultType,
      image: encodedImage,
      program: encodeURIComponent(
        Blockly.Xml.domToText(
          Blockly.Xml.blockSpaceToDom(Blockly.mainBlockSpace),
        ),
      ),
      // typically delay feedback until response back
      // for things like e.g. crowdsourced hints & hint blocks
      onComplete: function (response) {
        studioApp().displayFeedback({
          app: 'craft',
          skin: Craft.initialConfig.skin.id,
          feedbackType: testResultType,
          response: response,
          level: Craft.initialConfig.level,
          defaultToContinue: Craft.shouldDefaultToContinue(testResultType),
          appStrings: {
            reinfFeedbackMsg: craftMsg.reinfFeedbackMsg(),
            nextLevelMsg: craftMsg.nextLevelMsg({
              puzzleNumber: Craft.initialConfig.level.puzzle_number,
            }),
            tooManyBlocksFailMsgFunction: craftMsg.tooManyBlocksFail,
            generatedCodeDescription: craftMsg.generatedCodeDescription(),
          },
          feedbackImage: image,
          showingSharing: Craft.initialConfig.level.freePlay,
        });
      },
    });
  }

  /**
   * Whether pressing "x" or pressing the backdrop of the "level completed" dialog
   * should default to auto-advancing to the next level.
   * @param {string} testResultType TestResults type of this level completion
   * @returns {boolean} whether to continue
   */
  static shouldDefaultToContinue(testResultType) {
    const isFreePlay = testResultType === TestResults.FREE_PLAY;
    const isSuccess = testResultType > TestResults.APP_SPECIFIC_ACCEPTABLE_FAIL;
    return isSuccess && !isFreePlay;
  }
}
