/*
 * DBZ Legacy Reborn - Apotheosis Balance
 * Exact direct JSON overrides for Apotheosis 1.20.1-7.4.8
 *
 * Health bonuses: 20% of original
 * Damage bonuses: 40% of original
 * Royal Family all stats: 1.67%, 2.5%, 3.33%, 5%
 * Enchantment gem levels: +1, +1, +2, +2
 * Tyrannical Current HP Damage: removed
 * Giant Slaying Current HP Damage affix: disabled
 * Royal Family Current HP Damage: removed
 * Life Steal nerfed to 1-5%:
 *   - Blood Lord gem (light weapon): 1% / 2% / 3% / 4% / 4.5% / 5%
 *   - Vampiric sword/trident affix: rolls within 1-5% by rarity
 *
 * Requires a full server restart or /reload after the script is loaded.
 */

ServerEvents.highPriorityData(function (event) {

    // Disable Giant Slaying percentage-current-health damage affix.
    event.addJson("apotheosis:affixes/heavy_weapon/attribute/giant_slaying", {
        type: "apotheosis:attribute",
        attribute: "attributeslib:current_hp_damage",
        operation: "ADDITION",
        values: {},
        types: []
    });

    // Nerf Vampiric life steal affix to 1-5% (was ~15-40%).
    event.addJson("apotheosis:affixes/sword/attribute/vampiric", {
        type: "apotheosis:attribute",
        attribute: "attributeslib:life_steal",
        operation: "ADDITION",
        values: {
            common: { min: 0.01, steps: 2, step: 0.005 },
            uncommon: { min: 0.01, steps: 3, step: 0.005 },
            rare: { min: 0.015, steps: 4, step: 0.005 },
            epic: { min: 0.02, steps: 4, step: 0.005 },
            mythic: { min: 0.025, steps: 5, step: 0.005 },
            ancient: { min: 0.03, steps: 4, step: 0.005 }
        },
        types: ["sword", "trident"]
    });

    // core/ballast
    event.addJson("apotheosis:gems/core/ballast", {
        "variant": "ballast",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "minecraft:generic.attack_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.4,
                    "uncommon": 0.8,
                    "rare": 1.4,
                    "epic": 2,
                    "mythic": 2.8,
                    "ancient": 4
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "attribute": "minecraft:generic.attack_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.8,
                    "uncommon": 1.6,
                    "rare": 2,
                    "epic": 2.8,
                    "mythic": 3.6,
                    "ancient": 5.2
                }
            },
            {
                "type": "apotheosis:durability",
                "gem_class": {
                    "key": "breaker",
                    "types": [
                        "pickaxe",
                        "shovel"
                    ]
                },
                "values": {
                    "common": 0.1,
                    "uncommon": 0.15,
                    "rare": 0.25,
                    "epic": 0.35,
                    "mythic": 0.45,
                    "ancient": 0.6
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "attribute": "minecraft:generic.knockback_resistance",
                "operation": "ADDITION",
                "values": {
                    "common": 0.1,
                    "uncommon": 0.2,
                    "rare": 0.3,
                    "epic": 0.4,
                    "mythic": 0.5,
                    "ancient": 0.7
                }
            }
        ]
    });

    // core/brawlers
    event.addJson("apotheosis:gems/core/brawlers", {
        "variant": "brawlers",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "minecraft:generic.attack_speed",
                "operation": "MULTIPLY_BASE",
                "values": {
                    "common": 0.1,
                    "uncommon": 0.15,
                    "rare": 0.2,
                    "epic": 0.25,
                    "mythic": 0.35,
                    "ancient": 0.5
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "leggings",
                        "chestplate"
                    ]
                },
                "attribute": "minecraft:generic.max_health",
                "operation": "ADDITION",
                "values": {
                    "common": 0.2,
                    "uncommon": 0.4,
                    "rare": 0.8,
                    "epic": 1.2,
                    "mythic": 1.6,
                    "ancient": 2
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "attribute": "attributeslib:armor_pierce",
                "operation": "ADDITION",
                "values": {
                    "common": 1,
                    "uncommon": 2.5,
                    "rare": 5,
                    "epic": 7,
                    "mythic": 9,
                    "ancient": 14
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "shield",
                    "types": [
                        "shield"
                    ]
                },
                "attribute": "minecraft:generic.max_health",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "common": 0.01,
                    "uncommon": 0.02,
                    "rare": 0.03,
                    "epic": 0.04,
                    "mythic": 0.05,
                    "ancient": 0.06
                }
            }
        ]
    });

    // core/combatant
    event.addJson("apotheosis:gems/core/combatant", {
        "variant": "combatant",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "unique": true,
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "ranged_weapon",
                    "types": [
                        "trident",
                        "bow",
                        "crossbow"
                    ]
                },
                "attribute": "attributeslib:arrow_damage",
                "operation": "MULTIPLY_BASE",
                "values": {
                    "common": 0.02,
                    "uncommon": 0.06,
                    "rare": 0.08,
                    "epic": 0.12,
                    "mythic": 0.16,
                    "ancient": 0.2
                }
            },
            {
                "type": "apotheosis:damage_reduction",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "damage_type": "physical",
                "values": {
                    "common": 0.05,
                    "uncommon": 0.075,
                    "rare": 0.125,
                    "epic": 0.175,
                    "mythic": 0.225,
                    "ancient": 0.275
                }
            },
            {
                "type": "apotheosis:durability",
                "gem_class": {
                    "key": "melee_weapon",
                    "types": [
                        "sword",
                        "heavy_weapon"
                    ]
                },
                "values": {
                    "common": 0.05,
                    "uncommon": 0.1,
                    "rare": 0.15,
                    "epic": 0.225,
                    "mythic": 0.3,
                    "ancient": 0.4
                }
            }
        ]
    });

    // core/lunar
    event.addJson("apotheosis:gems/core/lunar", {
        "variant": "lunar",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "attributeslib:cold_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.4,
                    "uncommon": 0.6,
                    "rare": 1,
                    "epic": 1.6,
                    "mythic": 2.4,
                    "ancient": 3.2
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "attribute": "forge:entity_gravity",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "common": -0.1,
                    "uncommon": -0.25,
                    "rare": -0.45,
                    "epic": -0.65,
                    "mythic": -0.85,
                    "ancient": -1.04
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "boots",
                    "types": [
                        "boots"
                    ]
                },
                "attribute": "forge:swim_speed",
                "operation": "MULTIPLY_BASE",
                "values": {
                    "common": 0.1,
                    "uncommon": 0.2,
                    "rare": 0.3,
                    "epic": 0.45,
                    "mythic": 0.6,
                    "ancient": 0.8
                }
            }
        ]
    });

    // core/solar
    event.addJson("apotheosis:gems/core/solar", {
        "variant": "solar",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "attributeslib:fire_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.4,
                    "uncommon": 0.6,
                    "rare": 1,
                    "epic": 1.6,
                    "mythic": 2.4,
                    "ancient": 3.2
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "attribute": "forge:entity_gravity",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "common": 0.1,
                    "uncommon": 0.25,
                    "rare": 0.45,
                    "epic": 0.65,
                    "mythic": 0.85,
                    "ancient": 1.04
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "boots",
                    "types": [
                        "boots"
                    ]
                },
                "attribute": "forge:step_height_addition",
                "operation": "ADDITION",
                "values": {
                    "common": 0.5,
                    "uncommon": 0.75,
                    "rare": 1,
                    "epic": 1.25,
                    "mythic": 1.5,
                    "ancient": 2
                }
            }
        ]
    });

    // core/tyrannical
    event.addJson("apotheosis:gems/core/tyrannical", {
        "variant": "tyrannical",
        "weight": 10,
        "quality": 0,
        "unique": true,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "minecraft:generic.attack_knockback",
                "operation": "ADDITION",
                "values": {
                    "common": 0.5,
                    "uncommon": 1,
                    "rare": 1.5,
                    "epic": 2,
                    "mythic": 3,
                    "ancient": 3.5
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "attribute": "minecraft:generic.armor_toughness",
                "operation": "ADDITION",
                "values": {
                    "common": 0.5,
                    "uncommon": 1,
                    "rare": 1.5,
                    "epic": 2.5,
                    "mythic": 4,
                    "ancient": 6
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "shield",
                    "types": [
                        "shield"
                    ]
                },
                "attribute": "minecraft:generic.armor_toughness",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "common": 0.05,
                    "uncommon": 0.1,
                    "rare": 0.15,
                    "epic": 0.225,
                    "mythic": 0.3,
                    "ancient": 0.425
                }
            },
            {
                "type": "apotheosis:mob_effect",
                "gem_class": {
                    "key": "ranged_weapon",
                    "types": [
                        "bow",
                        "crossbow"
                    ]
                },
                "mob_effect": "attributeslib:bleeding",
                "stack_on_reapply": true,
                "target": "arrow_target",
                "values": {
                    "mythic": {
                        "duration": 160,
                        "amplifier": 0,
                        "cooldown": 40
                    },
                    "ancient": {
                        "duration": 160,
                        "amplifier": 1,
                        "cooldown": 40
                    }
                }
            }
        ]
    });

    // core/warlord
    event.addJson("apotheosis:gems/core/warlord", {
        "variant": "warlord",
        "weight": 10,
        "quality": 0,
        "dimensions": [],
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_ranged",
                    "types": [
                        "sword",
                        "trident",
                        "bow",
                        "crossbow"
                    ]
                },
                "attribute": "attributeslib:crit_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.02,
                    "uncommon": 0.04,
                    "rare": 0.06,
                    "epic": 0.08,
                    "mythic": 0.1,
                    "ancient": 0.12
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "attribute": "attributeslib:crit_damage",
                "operation": "ADDITION",
                "values": {
                    "common": 0.03,
                    "uncommon": 0.06,
                    "rare": 0.09,
                    "epic": 0.12,
                    "mythic": 0.14,
                    "ancient": 0.16
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "chestplate",
                    "types": [
                        "chestplate"
                    ]
                },
                "attribute": "minecraft:generic.max_health",
                "operation": "MULTIPLY_BASE",
                "values": {
                    "common": 0.01,
                    "uncommon": 0.02,
                    "rare": 0.03,
                    "epic": 0.04,
                    "mythic": 0.05,
                    "ancient": 0.06
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "helmet",
                    "types": [
                        "helmet"
                    ]
                },
                "attribute": "minecraft:generic.attack_damage",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "common": 0.02,
                    "uncommon": 0.04,
                    "rare": 0.05,
                    "epic": 0.06,
                    "mythic": 0.07,
                    "ancient": 0.08
                }
            }
        ]
    });

    // overworld/earth
    event.addJson("apotheosis:gems/overworld/earth", {
        "weight": 5,
        "quality": 1.5,
        "dimensions": [
            "overworld"
        ],
        "unique": true,
        "min_rarity": "rare",
        "bonuses": [
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "melee_weapon",
                    "types": [
                        "sword",
                        "trident",
                        "heavy_weapon"
                    ]
                },
                "enchantment": "sharpness",
                "must_exist": true,
                "values": {
                    "rare": 1,
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            },
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "core_armor",
                    "types": [
                        "chestplate",
                        "leggings"
                    ]
                },
                "enchantment": "protection",
                "must_exist": true,
                "values": {
                    "rare": 1,
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            },
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "breaker",
                    "types": [
                        "shovel",
                        "pickaxe"
                    ]
                },
                "enchantment": "fortune",
                "must_exist": true,
                "values": {
                    "rare": 1,
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            }
        ]
    });

    // overworld/royalty
    event.addJson("apotheosis:gems/overworld/royalty", {
        "weight": 5,
        "quality": 1.5,
        "dimensions": [
            "minecraft:overworld"
        ],
        "unique": true,
        "min_rarity": "rare",
        "bonuses": [
            {
                "type": "apotheosis:all_stats",
                "gem_class": {
                    "key": "helmet",
                    "types": [
                        "helmet"
                    ]
                },
                "operation": "multiply_total",
                "values": {
                    "rare": 0.0167,
                    "epic": 0.025,
                    "mythic": 0.0333,
                    "ancient": 0.05
                },
                "attributes": [
                    "minecraft:generic.max_health",
                    "minecraft:generic.knockback_resistance",
                    "minecraft:generic.movement_speed",
                    "minecraft:generic.attack_damage",
                    "minecraft:generic.attack_knockback",
                    "minecraft:generic.attack_speed",
                    "minecraft:generic.armor",
                    "minecraft:generic.armor_toughness",
                    "minecraft:generic.luck",
                    "attributeslib:armor_pierce",
                    "attributeslib:armor_shred",
                    "attributeslib:arrow_damage",
                    "attributeslib:arrow_velocity",
                    "attributeslib:cold_damage",
                    "attributeslib:crit_chance",
                    "attributeslib:crit_damage",
                    "attributeslib:dodge_chance",
                    "attributeslib:draw_speed",
                    "attributeslib:experience_gained",
                    "attributeslib:fire_damage",
                    "attributeslib:ghost_health",
                    "attributeslib:healing_received",
                    "attributeslib:life_steal",
                    "attributeslib:mining_speed",
                    "attributeslib:overheal",
                    "attributeslib:prot_pierce",
                    "attributeslib:prot_shred",
                    "forge:swim_speed",
                    "forge:block_reach",
                    "forge:entity_reach",
                    "forge:step_height_addition"
                ]
            },
            {
                "type": "apotheosis:drop_transform",
                "gem_class": {
                    "key": "pickaxe",
                    "types": [
                        "pickaxe"
                    ]
                },
                "blocks": "forge:ores/copper",
                "inputs": {
                    "tag": "forge:raw_materials/copper"
                },
                "output": {
                    "item": "minecraft:raw_gold"
                },
                "values": {
                    "rare": 0.15,
                    "epic": 0.2,
                    "mythic": 0.25,
                    "ancient": 0.4
                },
                "desc": "gem.apotheosis:overworld/royalty.bonus.pickaxe"
            },
            {
                "type": "apotheosis:multi_attribute",
                "desc": "bonus.apotheosis:multi_attr.desc.and",
                "gem_class": {
                    "key": "ranged_weapon",
                    "types": [
                        "bow",
                        "crossbow"
                    ]
                },
                "modifiers": [
                    {
                        "attribute": "attributeslib:prot_shred",
                        "operation": "ADDITION",
                        "values": {
                            "rare": 0.25,
                            "epic": 0.3,
                            "mythic": 0.35,
                            "ancient": 0.4
                        }
                    },
                    {
                        "attribute": "attributeslib:draw_speed",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "rare": -0.35,
                            "epic": -0.45,
                            "mythic": -0.55,
                            "ancient": -0.65
                        }
                    }
                ]
            },
            {
                "type": "apotheosis:multi_attribute",
                "desc": "bonus.apotheosis:multi_attr.desc.and_but",
                "gem_class": {
                    "key": "shield",
                    "types": [
                        "shield"
                    ]
                },
                "modifiers": [
                    {
                        "attribute": "minecraft:generic.armor",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "rare": 0.15,
                            "epic": 0.25,
                            "mythic": 0.35,
                            "ancient": 0.5
                        }
                    },
                    {
                        "attribute": "minecraft:generic.armor_toughness",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "rare": 0.075,
                            "epic": 0.125,
                            "mythic": 0.225,
                            "ancient": 0.3
                        }
                    },
                    {
                        "attribute": "minecraft:generic.movement_speed",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "rare": -0.25,
                            "epic": -0.3,
                            "mythic": -0.35,
                            "ancient": -0.4
                        }
                    }
                ]
            }
        ]
    });

    // the_end/endersurge
    event.addJson("apotheosis:gems/the_end/endersurge", {
        "weight": 5,
        "quality": 1.5,
        "min_rarity": "epic",
        "dimensions": [
            "the_end"
        ],
        "unique": true,
        "bonuses": [
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "anything",
                    "types": [
                        "bow",
                        "crossbow",
                        "pickaxe",
                        "shovel",
                        "heavy_weapon",
                        "helmet",
                        "chestplate",
                        "leggings",
                        "boots",
                        "shield",
                        "trident",
                        "sword"
                    ]
                },
                "enchantment": "sharpness",
                "_comment": "The enchantment field is unused when global=true, but must still be valid.",
                "global": true,
                "values": {
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            }
        ]
    });

    // the_nether/blood_lord
    event.addJson("apotheosis:gems/the_nether/blood_lord", {
        "weight": 5,
        "quality": 1.5,
        "dimensions": [
            "minecraft:the_nether"
        ],
        "unique": true,
        "min_rarity": "rare",
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "attribute": "attributeslib:life_steal",
                "operation": "ADDITION",
                "values": {
                    "common": 0.01,
                    "uncommon": 0.02,
                    "rare": 0.03,
                    "epic": 0.04,
                    "mythic": 0.045,
                    "ancient": 0.05
                }
            },
            {
                "type": "apotheosis:multi_attribute",
                "desc": "bonus.apotheosis:multi_attr.desc.and",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "modifiers": [
                    {
                        "attribute": "minecraft:generic.attack_damage",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "uncommon": 0.06,
                            "rare": 0.1,
                            "epic": 0.14,
                            "mythic": 0.18,
                            "ancient": 0.2
                        }
                    },
                    {
                        "attribute": "minecraft:generic.max_health",
                        "operation": "MULTIPLY_TOTAL",
                        "values": {
                            "uncommon": -0.15,
                            "rare": -0.25,
                            "epic": -0.35,
                            "mythic": -0.45,
                            "ancient": -0.5
                        }
                    }
                ]
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "chestplate",
                    "types": [
                        "chestplate"
                    ]
                },
                "attribute": "attributeslib:healing_received",
                "operation": "ADDITION",
                "values": {
                    "uncommon": 0.15,
                    "rare": 0.2,
                    "epic": 0.3,
                    "mythic": 0.4,
                    "ancient": 0.5
                }
            },
            {
                "type": "apotheosis:bloody_arrow",
                "values": {
                    "uncommon": {
                        "health_cost": 0.1,
                        "damage_mult": 1.12,
                        "cooldown": 400
                    },
                    "rare": {
                        "health_cost": 0.2,
                        "damage_mult": 1.24,
                        "cooldown": 450
                    },
                    "epic": {
                        "health_cost": 0.3,
                        "damage_mult": 1.36,
                        "cooldown": 500
                    },
                    "mythic": {
                        "health_cost": 0.4,
                        "damage_mult": 1.48,
                        "cooldown": 550
                    },
                    "ancient": {
                        "health_cost": 0.5,
                        "damage_mult": 1.6,
                        "cooldown": 600
                    }
                }
            },
            {
                "type": "apotheosis:leech_block",
                "values": {
                    "uncommon": {
                        "heal_factor": 0.15,
                        "cooldown": 400
                    },
                    "rare": {
                        "heal_factor": 0.25,
                        "cooldown": 650
                    },
                    "epic": {
                        "heal_factor": 0.4,
                        "cooldown": 800
                    },
                    "mythic": {
                        "heal_factor": 0.55,
                        "cooldown": 850
                    },
                    "ancient": {
                        "heal_factor": 0.65,
                        "cooldown": 1000
                    }
                }
            }
        ]
    });

    // the_nether/inferno
    event.addJson("apotheosis:gems/the_nether/inferno", {
        "conditions": [
            {
                "type": "apotheosis:module",
                "module": "enchantment"
            }
        ],
        "weight": 5,
        "quality": 1.5,
        "dimensions": [
            "the_nether"
        ],
        "unique": true,
        "min_rarity": "rare",
        "bonuses": [
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "attribute": "attributeslib:fire_damage",
                "operation": "ADDITION",
                "values": {
                    "rare": 2.4,
                    "epic": 3.2,
                    "mythic": 4,
                    "ancient": 5
                }
            },
            {
                "type": "apotheosis:mob_effect",
                "gem_class": {
                    "key": "light_weapon",
                    "types": [
                        "sword",
                        "trident"
                    ]
                },
                "mob_effect": "attributeslib:detonation",
                "target": "attack_target",
                "values": {
                    "mythic": {
                        "duration": 100,
                        "amplifier": 0,
                        "cooldown": 1200
                    },
                    "ancient": {
                        "duration": 100,
                        "amplifier": 1,
                        "cooldown": 1200
                    }
                }
            },
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "chestplate",
                    "types": [
                        "chestplate"
                    ]
                },
                "enchantment": "apotheosis:berserkers_fury",
                "values": {
                    "rare": 1,
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            },
            {
                "type": "apotheosis:enchantment",
                "gem_class": {
                    "key": "breaker",
                    "types": [
                        "shovel",
                        "pickaxe"
                    ]
                },
                "enchantment": "efficiency",
                "values": {
                    "rare": 1,
                    "epic": 1,
                    "mythic": 2,
                    "ancient": 2
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "helmet",
                    "types": [
                        "helmet"
                    ]
                },
                "attribute": "attributeslib:fire_damage",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "rare": 0.2,
                    "epic": 0.25,
                    "mythic": 0.3,
                    "ancient": 0.36
                }
            }
        ]
    });

    // twilight/queen
    event.addJson("apotheosis:gems/twilight/queen", {
        "conditions": [
            {
                "type": "forge:mod_loaded",
                "modid": "twilightforest"
            }
        ],
        "weight": 5,
        "quality": 1.5,
        "dimensions": [
            "twilightforest:twilight_forest"
        ],
        "unique": true,
        "min_rarity": "rare",
        "bonuses": [
            {
                "type": "apotheosis:twilight_fortification",
                "gem_class": {
                    "key": "chestplate",
                    "types": [
                        "chestplate"
                    ]
                },
                "values": {
                    "rare": {
                        "chance": 0.05,
                        "cooldown": 6000
                    },
                    "epic": {
                        "chance": 0.1,
                        "cooldown": 5400
                    },
                    "mythic": {
                        "chance": 0.125,
                        "cooldown": 5100
                    },
                    "ancient": {
                        "chance": 0.15,
                        "cooldown": 4800
                    }
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "helmet",
                    "types": [
                        "helmet"
                    ]
                },
                "attribute": "attributeslib:cold_damage",
                "operation": "MULTIPLY_TOTAL",
                "values": {
                    "rare": 0.2,
                    "epic": 0.25,
                    "mythic": 0.3,
                    "ancient": 0.36
                }
            },
            {
                "type": "apotheosis:attribute",
                "gem_class": {
                    "key": "heavy_weapon",
                    "types": [
                        "heavy_weapon"
                    ]
                },
                "attribute": "attributeslib:cold_damage",
                "operation": "ADDITION",
                "values": {
                    "rare": 2.4,
                    "epic": 3.2,
                    "mythic": 4,
                    "ancient": 5
                }
            },
            {
                "type": "apotheosis:mob_effect",
                "gem_class": {
                    "key": "ranged_weapon",
                    "types": [
                        "bow",
                        "crossbow",
                        "trident"
                    ]
                },
                "mob_effect": "twilightforest:frosted",
                "target": "arrow_target",
                "values": {
                    "mythic": {
                        "duration": 180,
                        "amplifier": 1,
                        "cooldown": 500
                    },
                    "ancient": {
                        "duration": 240,
                        "amplifier": 2,
                        "cooldown": 500
                    }
                }
            }
        ]
    });


    // Blessed armor max-health affix at 20% of original ranges.
    event.addJson("apotheosis:affixes/armor/attribute/blessed", {
        type: "apotheosis:attribute",
        attribute: "minecraft:generic.max_health",
        operation: "ADDITION",
        values: {
            common: { min: 0.4, steps: 2, step: 0.2 },
            uncommon: { min: 0.4, steps: 2, step: 0.2 },
            rare: { min: 0.6, steps: 3, step: 0.2 },
            epic: { min: 0.6, steps: 5, step: 0.2 },
            mythic: { min: 0.6, steps: 5, step: 0.2 },
            ancient: { min: 0.8, steps: 8, step: 0.2 }
        },
        types: ["helmet", "chestplate", "leggings", "boots"]
    });

    console.info(
        "[DBZ Legacy Reborn] Applied Apotheosis balance overrides (Blood Lord / Vampiric life steal 1-5%)."
    );
    console.info(
        "[DBZ Legacy Reborn] Note: existing gear keeps old rolls; lifesteal_cap.js hard-caps live attribute at 5%."
    );
});