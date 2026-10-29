# Same idea as examples/gamerule-names-1.21.11.mcfunction, for 1.20.1:
# camelCase game rules and the NBT form of item data instead of components.
# Run with --mc 1.20.1. On 1.21.11:
#   mctestbed lint examples/gamerule-names-1.20.1.mcfunction --mc 1.21.11
#@ players Alice

#@ as Alice
scoreboard objectives add pts dummy
scoreboard players add @s pts 1
give @s minecraft:paper{display:{Name:'{"text":"winner"}'}} 2

#@ as console
gamerule doDaylightCycle false
gamerule doWeatherCycle false
gamerule randomTickSpeed 0
gamerule maxEntityCramming 0

#@ assert if score Alice pts matches 1
#@ expect-output /Gave 2/
