import { checkEffectDurationOverride, copyConditions, copyEffectChanges, copyEffectDuration, effectDurationFromItemDuration, isInCombat } from "../utils.js";
import { applyConditionImmunity } from "./effect-flags.js";

export async function applyTargetEffects(item, applicationType, allTargetActors, effectiveTargetActors, masterEffect, config) {
    const actor = item.actor;

    const staticDuration = effectDurationFromItemDuration(item.data.data.duration, isInCombat(actor));
    const appliedDuration = masterEffect ? copyEffectDuration(masterEffect) : staticDuration;

    const effects = item.effects
        .filter(e => !e.isSuppressed && !e.data.transfer && (e.getFlag("wire", "applicationType") || "immediate") === applicationType)
        .filter(e => !config.variant || e.data.label.toLowerCase() === config.variant.toLowerCase());
    const allTargetsEffects = effects.filter(e => e.getFlag("wire", "applyOnSaveOrMiss"));
    const effectiveTargetsEffects = effects.filter(e => !e.getFlag("wire", "applyOnSaveOrMiss"));

    const makeEffectData = (effect) => {
        return {
            changes: copyEffectChanges(effect),
            origin: item.uuid,
            disabled: false,
            icon: effect.data.icon,
            label: effect.data.label,
            duration: checkEffectDurationOverride(appliedDuration, effect),
            flags: {
                wire: {
                    castingActorUuid: actor.uuid,
                    sourceEffectUuid: effect.uuid,
                    conditions: copyConditions(effect),
                    activationConfig: config,
                    masterEffectUuid: (masterEffect && !effect.data.flags.wire?.independentDuration)
                }
            }
        }
    };

    const allTargetsEffectData = allTargetsEffects.map(effect => makeEffectData(effect));
    const effectiveTargetsEffectData = effectiveTargetsEffects.map(effect => makeEffectData(effect));

    let createdEffects = [];

    const targetSet = new Set([...allTargetActors, ...effectiveTargetActors]);
    for (let target of targetSet) {
        const data = effectiveTargetActors.includes(target) ? [...allTargetsEffectData, ...effectiveTargetsEffectData] : allTargetsEffectData;

        const sourceEffectUuids = data.map(d => d.flags.wire.sourceEffectUuid);
        const existingEffects = target.effects.filter(e => sourceEffectUuids.includes(e.data.flags.wire?.sourceEffectUuid));
        if (existingEffects.length) {
            await target.deleteEmbeddedDocuments("ActiveEffect", existingEffects.map(e => e.id));
        }
        const checkedData = applyConditionImmunity(target, data);
        if (checkedData.length) {
            const targetEffects = await target.createEmbeddedDocuments("ActiveEffect", checkedData);
            createdEffects.push(...targetEffects);
        }
    }

    const trackedEffectUuids = createdEffects.filter(e => e.data.flags.wire?.masterEffectUuid).map(e => e.uuid);
    await masterEffect?.setFlag("wire", "childEffectUuids", [...(masterEffect?.data.flags.wire?.childEffectUuids || []), ...trackedEffectUuids]);

    return createdEffects;

    // const allTargetsTrackedEffectData = allTargetsEffects.filter(e => !e.data.flags.wire?.independentDuration).map(effect => makeEffectInfo(effect));
    // const allTargetsIndependentEffectData = allTargetsEffects.filter(e => e.data.flags.wire?.independentDuration).map(effect => makeEffectInfo(effect));
    // const effectiveTargetsTrackedEffectData = effectiveTargetsEffects.filter(e => !e.data.flags.wire?.independentDuration).map(effect => makeEffectInfo(effect));
    // const effectiveTargetsIndependentEffectData = effectiveTargetsEffects.filter(e => e.data.flags.wire?.independentDuration).map(effect => makeEffectInfo(effect));

    // let trackedEffects = [];
    // let independentEffects = [];

    // const applyEffect = async (target, data, queue) => {
    //     const sourceEffectUuids = data.map(d => d.flags.wire.sourceEffectUuid);
    //     const existingEffects = target.effects.filter(e => sourceEffectUuids.includes(e.data.flags.wire?.sourceEffectUuid));
    //     if (existingEffects.length) {
    //         await target.deleteEmbeddedDocuments("ActiveEffect", existingEffects.map(e => e.id));
    //     }
    //     const checkedData = applyConditionImmunity(target, data);
    //     if (checkedData.length) {
    //         const targetEffects = await target.createEmbeddedDocuments("ActiveEffect", checkedData);
    //         queue.push(...targetEffects);
    //     }
    // }

    // for (let target of allTargetActors) {
    //     await applyEffect(target, allTargetsTrackedEffectData, trackedEffects);
    //     await applyEffect(target, allTargetsIndependentEffectData, independentEffects);
    // }
    // for (let target of effectiveTargetActors) {
    //     await applyEffect(target, effectiveTargetsTrackedEffectData, trackedEffects);
    //     await applyEffect(target, effectiveTargetsIndependentEffectData, independentEffects);
    // }

    // const masterEffectChildEffectUuids = masterEffect?.data.flags.wire?.childEffectUuids || [];
    // await masterEffect?.setFlag("wire", "childEffectUuids", [...masterEffectChildEffectUuids, ...trackedEffects.map(e => e.uuid)]);

    // return [...trackedEffects, ...independentEffects];
}
