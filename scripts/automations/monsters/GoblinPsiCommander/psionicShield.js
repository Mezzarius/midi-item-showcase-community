// ##################################################################################################
// Author: Elwin#1410
// Read First!!!!
// Adds a third party reaction active effect, that effect will trigger a reaction by the owner of the feat
// when himself or a creature within range is hit to allow him to add an AC bonus that could
// turn the hit into a miss.
// v1.0.0
// Dependencies:
//  - DAE
//  - MidiQOL "on use" actor macro [preTargeting][tpr.isHit]
//  - Elwin Helpers world script
//
// How to configure:
// The Feature details must be:
//   - Feature Type: Monster Feature
//   - Activation cost: 1 Reaction
//   - Target: 1 Ally (RAW it's Creature, but use Ally to trigger reaction only on allies)
//   - Range: 15 feet
//   - Action Type: (empty)
// The Feature Midi-QOL must be:
//   - On Use Macros:
//       ItemMacro | Called before targeting is resolved
//   - Confirm Targets: Never
//   - Roll a separate attack per target: Never
//   - Activation Conditions
//     - Reaction:
//       reaction === "tpr.isHit" && !workflow.isCritical
//   - This item macro code must be added to the DIME code of this feat.
// Two effects must also be added:
//   - Psionic Shield:
//      - Transfer Effect to Actor on ItemEquip (checked)
//      - Effects:
//          - flags.midi-qol.onUseMacroName | Custom | ItemMacro,tpr.isHit|post=true
//   - Psionic Shield - AC Bonus:
//      - Transfer Effect to Actor on ItemEquip (unchecked)
//      - Duration: 1 Turn
//      - Special Duration: Is Attacked
//      - Effects:
//          - system.attributes.ac.bonus | Add | +3
//
// Usage:
// This item has a passive effect that adds a third party reaction active effect.
// It is also a reaction item that gets triggered by the third party reaction effect when appropriate.
//
// Description:
// In the preTargeting (item OnUse) phase of the Psionic Shield item (in owner's workflow):
//   Validates that item was triggered by the remote tpr.isHit target on use,
//   otherwise the item workflow execution is aborted.
// In the tpr.isHit (TargetOnUse) post macro (in attacker's workflow) (on owner or other target):
//   If the reaction was used and completed successfully, the current workflow check hits it re-executed to
//   taken into account the AC bonus and validate if the attack is still a hit.
// ###################################################################################################

export async function psionicShield({
  speaker,
  actor,
  token,
  character,
  item,
  args,
  scope,
  workflow,
  options,
}) {
  // Default name of the feature
  const DEFAULT_ITEM_NAME = 'Psionic Shield';
  const debug = globalThis.elwinHelpers?.isDebugEnabled() ?? false;

  if (
    !foundry.utils.isNewerVersion(
      globalThis?.elwinHelpers?.version ?? '1.1',
      '2.2'
    )
  ) {
    const errorMsg = `${DEFAULT_ITEM_NAME}: The Elwin Helpers setting must be enabled.`;
    ui.notifications.error(errorMsg);
    return;
  }
  const dependencies = ['dae', 'midi-qol'];
  if (!elwinHelpers.requirementsSatisfied(DEFAULT_ITEM_NAME, dependencies)) {
    return;
  }

  if (debug) {
    console.warn(
      DEFAULT_ITEM_NAME,
      { phase: args[0].tag ? `${args[0].tag}-${args[0].macroPass}` : args[0] },
      arguments
    );
  }

  if (args[0].tag === 'OnUse' && args[0].macroPass === 'preTargeting') {
    return handleOnUsePreTargeting(workflow, scope.macroItem);
  } else if (
    args[0].tag === 'TargetOnUse' &&
    args[0].macroPass === 'tpr.isHit.post'
  ) {
    if (!token) {
      // No target
      if (debug) {
        console.warn(`${DEFAULT_ITEM_NAME} | No target token.`);
      }
      return;
    }
    // Other target, handle reaction
    await handleTargetOnUseIsHitPost(
      workflow,
      token,
      scope.macroItem,
      options?.thirdPartyReactionResult
    );
  }

  /**
   * Handles the preTargeting phase of the Psionic Shield item.
   * Validates that the reaction was triggered by the tpr.isHit phase.
   *
   * @param {MidiQOL.Workflow} currentWorkflow - The current midi-qol workflow.
   * @param {Item5e} sourceItem - The Psionic Shield item.
   *
   * @returns {boolean} true if all requirements are fulfilled, false otherwise.
   */
  function handleOnUsePreTargeting(currentWorkflow, sourceItem) {
    if (
      currentWorkflow.options?.thirdPartyReaction?.trigger !== 'tpr.isHit' ||
      !currentWorkflow.options?.thirdPartyReaction?.itemUuids?.includes(
        sourceItem.uuid
      )
    ) {
      // Reaction should only be triggered by third party reaction effect
      const msg = `${DEFAULT_ITEM_NAME} | This reaction can only be triggered when a nearby creature or the owner is hit.`;
      ui.notifications.warn(msg);
      return false;
    }
    return true;
  }

  /**
   * Handles the tpr.isHit post reaction of the Psionic Shield item in the triggering midi-qol workflow.
   * If the reaction was used and completed successfully, re-execute checkHits to see if the added AC bonus
   * could convert a hit on the target into a miss.
   *
   * @param {MidiQOL.Workflow} currentWorkflow - The current midi-qol workflow.
   * @param {Item5e} sourceItem - The Psionic Shield item.
   * @param {object} thirdPartyReactionResult - The third party reaction result.
   */
  async function handleTargetOnUseIsHitPost(
    currentWorkflow,
    sourceItem,
    thirdPartyReactionResult
  ) {
    if (debug) {
      console.warn(DEFAULT_ITEM_NAME + ' | reaction result', {
        thirdPartyReactionResult,
      });
    }
    if (thirdPartyReactionResult?.uuid !== sourceItem.uuid) {
      return;
    }

    // Recompute checkHits to take into account the AC bonus
    currentWorkflow.checkHits({
      noProvokeReaction: true,
      noOnUseMacro: true,
      noTargetOnuseMacro: true,
    });
  }
}
