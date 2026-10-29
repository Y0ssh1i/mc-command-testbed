# No "#@ players" line: the number of players comes from --players (default 3).
# Every fake player runs the same command as themselves; the last line checks the result.
#@ as console
scoreboard objectives add visits dummy
team add lobby
#@ as Alice
team join lobby @s
scoreboard players add @s visits 1
#@ as Bob
team join lobby @s
scoreboard players add @s visits 1
#@ as Carol
team join lobby @s
scoreboard players add @s visits 1
#@ wait 200ms
#@ assert if entity @a[team=lobby]
#@ show scores
