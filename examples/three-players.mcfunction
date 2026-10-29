# Three players each run a command from their own seat, no command blocks involved.
#@ players Alice Bob Carol

# Console sets the stage. No "gamerule" line on purpose: game rule names differ
# between versions (see versions/*.yaml and `mctestbed lint`), and this example
# is meant to run on every version the tool supports.
scoreboard objectives add pts dummy
scoreboard players set Alice pts 0
scoreboard players set Bob pts 0
scoreboard players set Carol pts 0

# Each player acts as themselves (@s is that player)
#@ as Alice
give @s minecraft:diamond 3
scoreboard players add @s pts 5
#@ expect Alice /Added 5 to \[pts\]/
tag @s add red_team

#@ as Bob
scoreboard players add @s pts 2
tag @s add blue_team

#@ as Carol
scoreboard players add @s pts 7
tag @s add blue_team

# Console builds something and summons a mob
#@ as console
setblock ~ ~ ~ minecraft:gold_block
summon minecraft:zombie ~3 ~ ~ {NoAI:1b,Tags:["target"]}
#@ wait 500ms

# Checks (vanilla "execute if ..." conditions)
#@ assert if score Alice pts matches 5
#@ assert if score Bob pts matches 2
#@ assert if score Carol pts matches 7
#@ assert if entity @a[tag=blue_team] 
#@ assert if entity @e[type=minecraft:zombie,tag=target]
#@ assert unless entity @a[tag=green_team]
#@ show scores
#@ show entity @a[tag=blue_team]
