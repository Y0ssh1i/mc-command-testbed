# Shows the differences that bite most often: game rule names and item components.
# Run with --mc 1.21.11. On an older version the lint stops you before the server
# even starts:
#   mctestbed lint examples/gamerule-names-1.21.11.mcfunction --mc 1.20.1
#@ players Alice

#@ as Alice
scoreboard objectives add pts dummy
scoreboard players add @s pts 1
give @s minecraft:paper[minecraft:custom_name='{"text":"winner"}'] 2

#@ as console
gamerule advance_time false
gamerule advance_weather false
gamerule random_tick_speed 0
gamerule max_entity_cramming 0

#@ assert if score Alice pts matches 1
#@ expect-output /Gave 2/
