using System;
using GhostList.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260613000000_AddReplyAndReadReceipts")]
    partial class AddReplyAndReadReceipts
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.8")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedMessage")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<string>("EncryptedSenderName")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid?>("ReplyToMessageId")
                        .HasColumnType("uuid");

                    b.Property<string>("SenderNameInitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostChatMessages");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<int>("CompletedItemsTtl")
                        .HasColumnType("integer");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("OwnerTokenHash")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.HasKey("Id");

                    b.ToTable("GhostLists");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime?>("CheckedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedPayload")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<bool>("IsChecked")
                        .HasColumnType("boolean");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostListItems");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.DeviceSubscription", b =>
                {
                    b.Property<string>("DeviceToken")
                        .HasMaxLength(512)
                        .HasColumnType("character varying(512)");

                    b.Property<Guid>("ListId")
                        .HasColumnType("uuid");

                    b.Property<DateTime>("RegisteredAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("DeviceToken", "ListId");

                    b.HasIndex("ListId");

                    b.ToTable("DeviceSubscriptions");

                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany()
                        .HasForeignKey("ListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListMember", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("DeviceId")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<string>("EncryptedPayload")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<DateTimeOffset?>("LastReadItemAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("LastReadMessageAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId", "DeviceId")
                        .IsUnique();

                    b.ToTable("GhostListMembers");

                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany()
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("ChatMessages")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("Items")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Navigation("ChatMessages");
                    b.Navigation("Items");
                });
        }
    }
}
